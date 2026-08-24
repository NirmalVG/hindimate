// lib/stores/use-chat-store.ts
import { create } from "zustand"

type AgentStatus = "idle" | "thinking" | "quizzing you" | "checking your answer"

interface ChatState {
  draftMessage: string
  agentStatus: AgentStatus
  setDraftMessage: (message: string) => void
  setAgentStatus: (status: AgentStatus) => void
}

export const useChatStore = create<ChatState>((set) => ({
  draftMessage: "",
  agentStatus: "idle",
  setDraftMessage: (message) => set({ draftMessage: message }),
  setAgentStatus: (status) => set({ agentStatus: status }),
}))
