"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/grexya/icon";
import { AGENT_LIST } from "@/lib/agents";
import type { AgentKey } from "@/lib/agents";
import { getAgentMessages } from "@/app/actions/chat";
import type { Project } from "@/lib/types";

type Msg = { role: "user" | "bot"; text: string };

function fmt(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/^&gt; (.*)$/, '<span class="q">$1</span>')
    .replace(/^> (.*)$/, '<span class="q">$1</span>')
    .replace(/^• (.*)$/, '<span class="li">• $1</span>')
    .replace(/^(\d)\. (.*)$/, '<span class="li"><b>$1.</b> $2</span>');
}

export function ChatPanel({
  project,
  onClose,
}: {
  project: Project | null;
  onClose: () => void;
}) {
  const accent = project?.accent ?? "#5B5BD6";
  const [closing, setClosing] = useState(false);
  const [agentKey, setAgentKey] = useState<AgentKey>("grexya");
  const [selOpen, setSelOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const agent = AGENT_LIST.find((a) => a.key === agentKey)!;

  const close = () => {
    setClosing(true);
    setTimeout(onClose, 260);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    if (!project) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMsgs([]);
      return;
    }
    getAgentMessages(project.id, agentKey).then((m) => {
      if (active) setMsgs(m.map((x) => ({ role: x.role === "assistant" ? "bot" : "user", text: x.content })));
    });
    return () => {
      active = false;
    };
  }, [project, agentKey]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, streaming]);

  async function send() {
    const text = input.trim();
    if (!text || streaming || !project) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }, { role: "bot", text: "" }]);
    setStreaming(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, agentKey, message: text }),
      });
      if (!res.ok || !res.body) {
        const err = await res.text();
        setMsgs((m) => {
          const c = [...m];
          c[c.length - 1] = { role: "bot", text: `⚠️ ${err}` };
          return c;
        });
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs((m) => {
          const c = [...m];
          c[c.length - 1] = { role: "bot", text: acc };
          return c;
        });
      }
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className={`chatover ${closing ? "closing" : ""}`} style={{ ["--accent" as string]: accent }}>
      <div className="co-scrim" onClick={close} />
      <div className="co-panel">
        <div className="co-head">
          <div className="co-sel-wrap">
            <button className={`co-sel ${selOpen ? "open" : ""}`} onClick={() => setSelOpen((o) => !o)}>
              <span className="agent-av sm" style={{ ["--av" as string]: agent.av }}>
                {agent.emoji}
              </span>
              <span className="co-sel-meta">
                <span className="co-sel-name">{agent.name}</span>
                <span className="co-sel-role">{agent.role}</span>
              </span>
              <Icon name="chevDown" size={15} className="faint" />
            </button>
            {selOpen && (
              <>
                <div className="pop-scrim" onClick={() => setSelOpen(false)} />
                <div className="co-sel-pop">
                  <span className="sw-group">Elige un agente</span>
                  {AGENT_LIST.map((a) => (
                    <button
                      key={a.key}
                      className={`sw-item ${agentKey === a.key ? "on" : ""}`}
                      onClick={() => {
                        setAgentKey(a.key);
                        setSelOpen(false);
                      }}
                    >
                      <span className="agent-av sm" style={{ ["--av" as string]: a.av }}>
                        {a.emoji}
                      </span>
                      <span className="co-ag-meta">
                        <span className="co-ag-name">{a.name}</span>
                        <span className="co-ag-role">{a.role}</span>
                      </span>
                      {agentKey === a.key && <Icon name="check" size={15} className="sw-check" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="co-head-actions">
            <button className="icon-btn sm" title="Nuevo chat" onClick={() => setMsgs([])}>
              <Icon name="plus" size={17} />
            </button>
            <button className="icon-btn sm" onClick={close}>
              <Icon name="x" size={17} />
            </button>
          </div>
        </div>

        <div className="co-scroll" ref={scrollRef}>
          {msgs.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--text-3)", padding: "40px 10px", fontSize: 14 }}>
              {project
                ? `Pregúntale a ${agent.name} sobre ${project.name}.`
                : "Entra a un mundo para chatear con sus agentes."}
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`bubble-row ${m.role}`}>
              {m.role === "bot" && (
                <span className="agent-av sm" style={{ ["--av" as string]: agent.av }}>
                  {agent.emoji}
                </span>
              )}
              <div className={`bubble ${m.role}`}>
                {(m.text || (streaming && i === msgs.length - 1 ? "…" : "")).split("\n").map((ln, j) => (
                  <p key={j} dangerouslySetInnerHTML={{ __html: fmt(ln) }} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="co-input">
          <input
            placeholder={project ? `Escríbele a ${agent.name}…` : "Entra a un mundo…"}
            value={input}
            disabled={!project}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
          />
          <button className="chat-send" onClick={send}>
            <Icon name="send" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
