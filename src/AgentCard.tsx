import {
  agentReply,
  readAgentKey,
  saveAgentKey,
  AgentError,
} from "./agentClient";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Settings2,
  Send,
  Square,
  RotateCcw,
  Plus,
  ArrowLeft,
} from "lucide-react";
import type { Card } from "./storage";
import {
  agentBaseUrl,
  agentState,
  validAgentText,
  type AgentState,
} from "./agent";
import { t as tr, usePreferences } from "./i18n";
import "./agent.css";

export function AgentCard({
  card,
  onChange,
}: {
  card: Card;
  onChange?: (text: string) => void;
}) {
  usePreferences();
  const state = useMemo(() => agentState(card.text), [card.text]);
  const editable = !!onChange;
  const [settings, setSettings] = useState(false);
  const [draft, setDraft] = useState(state);
  const [key, setKey] = useState("");
  const [input, setInput] = useState("");
  const [partial, setPartial] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef({ card, onChange });
  latest.current = { card, onChange };
  const request = useRef<
    | {
        controller: AbortController;
        snapshot: string;
        stopped: boolean;
        timeout: boolean;
      }
    | undefined
  >(undefined);
  const log = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  useEffect(
    () => () => {
      request.current?.controller.abort();
      request.current = undefined;
    },
    [],
  );
  // Undo, restore or external edits invalidate the in-flight conversation.
  useEffect(() => {
    if (request.current && request.current.snapshot !== card.text)
      request.current.controller.abort();
  }, [card.text]);
  useLayoutEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [state.messages.length, partial, settings]);
  const configure = () => {
    setDraft(state);
    setKey(readAgentKey(card.id, state.baseUrl));
    setSettings(true);
    setError("");
  };
  const save = () => {
    try {
      const next = {
        ...draft,
        baseUrl: agentBaseUrl(draft.baseUrl),
        model: draft.model.trim(),
        messages: state.messages,
      };
      if (!validAgentText(JSON.stringify(next)))
        throw Error("请检查模型名称和配置长度");
      saveAgentKey(card.id, next.baseUrl, key);
      onChange?.(JSON.stringify(next));
      setSettings(false);
      setKey("");
      setError("");
    } catch {
      setError(tr("无法保存配置，请检查接口地址、模型及浏览器存储权限"));
    }
  };
  const send = async (retry = false) => {
    if (request.current || !editable) return;
    const apiKey = readAgentKey(card.id, state.baseUrl);
    if (!apiKey) {
      configure();
      setError(tr("请先填写 API Key"));
      return;
    }
    const content = input.trim();
    if (!retry && !content) return;
    const next: AgentState = {
      ...state,
      messages: retry
        ? state.messages
        : [...state.messages, { role: "user", content }],
    };
    const snapshot = JSON.stringify(next);
    if (!validAgentText(snapshot) || next.messages.length >= 400) {
      setError(tr("对话过长，请新建对话后继续"));
      return;
    }
    const active = {
      controller: new AbortController(),
      snapshot,
      stopped: false,
      timeout: false,
    };
    request.current = active;
    onChange?.(snapshot);
    setInput("");
    setPartial("");
    setBusy(true);
    setError("");
    let answer = "";
    const timer = window.setTimeout(() => {
      active.timeout = true;
      active.controller.abort();
    }, 120000);
    const current = () =>
      request.current === active && latest.current.card.text === snapshot;
    const persist = () => {
      const text = JSON.stringify({
        ...next,
        messages: [...next.messages, { role: "assistant", content: answer }],
      });
      if (validAgentText(text)) latest.current.onChange?.(text);
      else setError(tr("对话过长，请新建对话后继续"));
    };
    try {
      answer = await agentReply(
        next,
        apiKey,
        active.controller.signal,
        (text) => {
          answer = text;
          if (request.current === active) setPartial(text);
        },
      );
      if (current()) persist();
    } catch (e) {
      if (current()) {
        if (active.stopped && answer) persist();
        else if (active.timeout) setError(tr("回复超时，请重试"));
        else if (!active.controller.signal.aborted)
          setError(
            e instanceof AgentError
              ? tr(e.message)
              : tr("无法连接接口，请检查网络、地址及跨域设置"),
          );
      }
    } finally {
      clearTimeout(timer);
      if (request.current === active) {
        request.current = undefined;
        setBusy(false);
        setPartial("");
      }
    }
  };
  const lastUser = state.messages.at(-1)?.role === "user";
  return (
    <section
      className="agent-card"
      aria-label={tr("Agent 对话")}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <header className="agent-header">
        <span>
          <Bot size={17} />
          <strong>Agent</strong>
          <small title={state.model}>{state.model}</small>
        </span>
        {editable && (
          <div>
            <button
              title={tr("新建对话")}
              aria-label={tr("新建对话")}
              disabled={busy || settings || !state.messages.length}
              onClick={() => {
                onChange?.(JSON.stringify({ ...state, messages: [] }));
                setError("");
              }}
            >
              <Plus size={15} />
            </button>
            <button
              title={tr("Agent 设置")}
              aria-label={tr("Agent 设置")}
              disabled={busy}
              onClick={configure}
            >
              <Settings2 size={15} />
            </button>
          </div>
        )}
      </header>
      {settings && editable ? (
        <form
          className="agent-settings"
          onWheel={(e) => {
            if (!e.ctrlKey && !e.metaKey) e.stopPropagation();
          }}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label>
            {tr("接口地址")}
            <input
              type="url"
              required
              value={draft.baseUrl}
              onChange={(e) => {
                setDraft({ ...draft, baseUrl: e.target.value });
                setKey(readAgentKey(card.id, e.target.value));
              }}
            />
          </label>
          <label>
            {tr("接口协议")}
            <select
              aria-label={tr("接口协议")}
              value={draft.protocol}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  protocol: e.target.value as AgentState["protocol"],
                })
              }
            >
              <option value="responses">OpenAI Responses</option>
              <option value="chat">
                OpenAI Chat Completions ({tr("兼容接口")})
              </option>
            </select>
          </label>
          <label>
            {tr("模型")}
            <input
              required
              maxLength={200}
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            />
          </label>
          <label>
            API Key
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={tr("填写 API Key")}
            />
          </label>
          <p className="agent-hint">
            {tr(
              "Key 仅保存在当前浏览器，不随画布导出或分享。清空后保存可移除。",
            )}
          </p>
          <label>
            {tr("系统提示词")}
            <textarea
              rows={3}
              maxLength={10000}
              value={draft.instructions}
              onChange={(e) =>
                setDraft({ ...draft, instructions: e.target.value })
              }
              placeholder={tr("设置 Agent 的角色和回答方式")}
            />
          </label>
          {error && (
            <p className="agent-error" role="alert">
              {error}
            </p>
          )}
          <footer>
            <button
              type="button"
              onClick={() => {
                setSettings(false);
                setKey("");
                setError("");
              }}
            >
              <ArrowLeft size={14} />
              {tr("返回")}
            </button>
            <button className="agent-primary" type="submit">
              {tr("保存配置")}
            </button>
          </footer>
        </form>
      ) : (
        <>
          <div
            className="agent-messages"
            ref={log}
            role="log"
            aria-label={tr("对话记录")}
            aria-live={busy ? "off" : "polite"}
            onPointerDown={(e) => {
              if (e.button === 0 && !e.ctrlKey && !e.metaKey)
                e.stopPropagation();
            }}
            onWheel={(e) => {
              if (!e.ctrlKey && !e.metaKey) e.stopPropagation();
            }}
          >
            {!state.messages.length && (
              <div className="agent-empty">
                <Bot size={30} />
                <strong>{tr("和 Agent 聊聊")}</strong>
                <p>
                  {editable
                    ? tr("配置 API Key 后，在这里开始对话")
                    : tr("暂无对话记录")}
                </p>
                {editable && (
                  <button onClick={configure}>{tr("配置 Agent")}</button>
                )}
              </div>
            )}
            {state.messages.map((message, i) => (
              <div className={`agent-message ${message.role}`} key={i}>
                <small>{message.role === "user" ? tr("你") : "Agent"}</small>
                <div>{message.content}</div>
              </div>
            ))}
            {busy && (
              <div className="agent-message assistant">
                <small>Agent</small>
                <div>{partial || tr("正在思考…")}</div>
              </div>
            )}
          </div>
          {error && (
            <p className="agent-error" role="alert">
              {error}
            </p>
          )}
          {editable ? (
            <form
              className="agent-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              {!busy && lastUser && (
                <button
                  className="agent-retry"
                  type="button"
                  onClick={() => void send(true)}
                >
                  <RotateCcw size={13} />
                  {tr("重新生成")}
                </button>
              )}
              <textarea
                aria-label={tr("发送给 Agent")}
                placeholder={tr("输入消息，Enter 发送")}
                value={input}
                maxLength={100000}
                disabled={busy}
                onChange={(e) => setInput(e.target.value)}
                onCompositionStart={() => {
                  composing.current = true;
                }}
                onCompositionEnd={() => {
                  composing.current = false;
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing &&
                    !composing.current
                  ) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              {busy ? (
                <button
                  type="button"
                  aria-label={tr("停止生成")}
                  onClick={() => {
                    if (request.current) {
                      request.current.stopped = true;
                      request.current.controller.abort();
                    }
                  }}
                >
                  <Square size={15} />
                </button>
              ) : (
                <button
                  className="agent-primary"
                  type="submit"
                  aria-label={tr("发送消息")}
                  disabled={!input.trim()}
                >
                  <Send size={15} />
                </button>
              )}
            </form>
          ) : (
            <p className="agent-readonly">{tr("只读对话")}</p>
          )}
        </>
      )}
    </section>
  );
}
