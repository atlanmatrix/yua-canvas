import { agentBaseUrl, type AgentState } from "./agent";
export class AgentError extends Error {}
export const agentKeyName = (id: string, baseUrl: string) =>
  `yua-agent-key:${id}:${agentBaseUrl(baseUrl)}`;
export function readAgentKey(id: string, baseUrl: string) {
  try {
    return localStorage.getItem(agentKeyName(id, baseUrl)) || "";
  } catch {
    return "";
  }
}
export function saveAgentKey(id: string, baseUrl: string, value: string) {
  const name = agentKeyName(id, baseUrl);
  if (value.trim()) localStorage.setItem(name, value.trim());
  else localStorage.removeItem(name);
}
// Consume SSE line by line: transport chunks need not align with events or UTF-8 characters.
export async function agentReply(
  state: AgentState,
  key: string,
  signal: AbortSignal,
  onText: (text: string) => void,
) {
  const chat = state.protocol === "chat";
  const response = await fetch(
    `${agentBaseUrl(state.baseUrl)}/${chat ? "chat/completions" : "responses"}`,
    {
      method: "POST",
      signal,
      credentials: "omit",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(
        chat
          ? {
              model: state.model,
              stream: true,
              messages: [
                ...(state.instructions
                  ? [{ role: "system", content: state.instructions }]
                  : []),
                ...state.messages,
              ],
            }
          : {
              model: state.model,
              stream: true,
              store: false,
              ...(state.instructions
                ? { instructions: state.instructions }
                : {}),
              input: state.messages,
            },
      ),
    },
  );
  if (!response.ok) {
    // Never echo provider error bodies: they may contain the submitted credential.
    const errors: Record<number, string> = {
      401: "API Key 无效或已过期，请检查设置",
      403: "当前 Key 无权使用此模型或接口",
      404: "模型或接口不存在，请检查设置",
      429: "请求受限或额度不足，请稍后重试",
    };
    throw new AgentError(
      errors[response.status] || `请求失败（HTTP ${response.status}）`,
    );
  }
  let text = "",
    completed = false;
  const append = (delta: unknown) => {
    if (typeof delta !== "string") return;
    if (text.length + delta.length > 100000)
      throw new AgentError("回复过长，请缩短问题后重试");
    text += delta;
    onText(text);
  };
  const output = (r: any) =>
    (r?.output || [])
      .flatMap((item: any) => item.content || [])
      .map((item: any) => item.text || item.refusal || "")
      .join("");
  if (response.headers.get("content-type")?.includes("application/json")) {
    const value = await response.json();
    if (
      value.error ||
      value.status === "failed" ||
      value.status === "incomplete"
    )
      throw new AgentError("服务未能完成回复，请重试");
    append(
      chat
        ? value.choices?.[0]?.message?.content
        : value.output_text || output(value),
    );
    completed = true;
  } else {
    if (!response.body) throw new AgentError("接口未返回可读取的回复");
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let buffer = "",
      data: string[] = [];
    const event = () => {
      if (!data.length) return;
      const raw = data.join("\n");
      data = [];
      if (raw === "[DONE]") {
        completed = true;
        return;
      }
      const value = JSON.parse(raw);
      if (
        value.error ||
        ["error", "response.failed", "response.incomplete"].includes(value.type)
      )
        throw new AgentError("服务未能完成回复，请重试");
      if (chat) {
        const choice = value.choices?.[0];
        append(choice?.delta?.content);
        if (choice?.finish_reason) {
          if (choice.finish_reason !== "stop")
            throw new AgentError("回复未完成，请重试或缩短问题");
          completed = true;
        }
      } else {
        if (
          ["response.output_text.delta", "response.refusal.delta"].includes(
            value.type,
          )
        )
          append(value.delta);
        if (value.type === "response.completed") {
          if (!text) append(output(value.response));
          completed = true;
        }
      }
    };
    const line = (value: string) => {
      value = value.replace(/\r$/, "");
      if (!value) event();
      else if (value.startsWith("data:"))
        data.push(value.slice(5).replace(/^ /, ""));
    };
    try {
      while (true) {
        const chunk = await reader.read();
        buffer += chunk.done
          ? decoder.decode()
          : decoder.decode(chunk.value, { stream: true });
        if (buffer.length > 2_000_000) throw new AgentError("接口回复格式异常");
        let end: number;
        while ((end = buffer.indexOf("\n")) >= 0) {
          line(buffer.slice(0, end));
          buffer = buffer.slice(end + 1);
        }
        if (chunk.done) {
          if (buffer) line(buffer);
          event();
          break;
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  if (!completed) throw new AgentError("连接中断，请重试");
  if (!text.trim())
    throw new AgentError("接口未返回文字回复，请检查模型和接口协议");
  return text;
}
