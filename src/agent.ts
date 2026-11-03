export type AgentMessage = { role: "user" | "assistant"; content: string };
export type AgentState = {
  baseUrl: string;
  model: string;
  protocol: "responses" | "chat";
  instructions: string;
  messages: AgentMessage[];
};
export const defaultAgent: AgentState = {
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-5-mini",
  protocol: "responses",
  instructions: "",
  messages: [],
};
export function agentBaseUrl(value: string): string {
  const url = new URL(value.trim());
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw Error("请输入 HTTPS 接口地址（本地服务可使用 HTTP）");
  return url.href.replace(/\/+$/, "");
}
export function validAgentText(text: unknown): boolean {
  if (typeof text !== "string" || text.length > 2_000_000) return false;
  try {
    const v = JSON.parse(text);
    return (
      !!v &&
      !Array.isArray(v) &&
      Object.keys(v).every((k) =>
        ["baseUrl", "model", "protocol", "instructions", "messages"].includes(
          k,
        ),
      ) &&
      typeof v.baseUrl === "string" &&
      v.baseUrl.length <= 2000 &&
      !!agentBaseUrl(v.baseUrl) &&
      typeof v.model === "string" &&
      !!v.model.trim() &&
      v.model.length <= 200 &&
      ["responses", "chat"].includes(v.protocol) &&
      typeof v.instructions === "string" &&
      v.instructions.length <= 10000 &&
      Array.isArray(v.messages) &&
      v.messages.length <= 400 &&
      v.messages.every(
        (m: AgentMessage) =>
          m &&
          Object.keys(m).every((k) => ["role", "content"].includes(k)) &&
          ["user", "assistant"].includes(m.role) &&
          typeof m.content === "string" &&
          m.content.length <= 100000,
      )
    );
  } catch {
    return false;
  }
}
export function agentState(text: string): AgentState {
  return validAgentText(text)
    ? JSON.parse(text)
    : { ...defaultAgent, messages: [] };
}
