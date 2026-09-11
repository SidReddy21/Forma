import { useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Bot,
  Check,
  CircleAlert,
  Clock3,
  Code2,
  Frame,
  Loader2,
  LocateFixed,
  Send,
  ShieldCheck,
  Square,
  X,
} from 'lucide-react';
import type { Workspace } from '../canvas/Workspace';
import type { AgentDirection, AgentSettings } from '../../../shared/workspace';
import { IconButton } from './Controls';

export function AgentPanel({
  w,
  close,
  openCode,
  openCanvas,
}: {
  w: Workspace;
  close: () => void;
  openCode: () => void;
  openCanvas: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const agent = w.provider.agent;
  const connected = w.provider.status === 'live';
  const send = (direction: AgentDirection) => {
    if (
      !w.provider.command({
        action: 'run',
        direction,
        ...(direction === 'prompt' ? { prompt } : {}),
        ...(direction === 'canvas-to-code' && w.selected.length ? { selection: w.selected } : {}),
      })
    )
      w.notify('Reconnect before asking the agent to edit.');
    else {
      if (direction === 'canvas-to-code') openCode();
      if (direction === 'prompt') setPrompt('');
    }
  };
  const settings = (patch: Partial<AgentSettings>) =>
    w.provider.command({ action: 'settings', settings: { ...agent.settings, ...patch } });
  return (
    <aside className="agent-panel">
      <div className="agent-heading">
        <span className="agent-symbol">
          <Bot size={17} />
        </span>
        <div>
          <h2>Forma agent</h2>
          <span>{agent.engine === 'workers-ai' ? 'Workers AI connected' : 'Structural mode'}</span>
        </div>
        <IconButton label="Close agent" onClick={close}>
          <X size={16} />
        </IconButton>
      </div>
      <div className="agent-scroll">
        <section className="agent-translations">
          <div className="agent-section-title">
            <h3>Translate</h3>
            <span>{w.selected.length ? `${w.selected.length} selected` : 'Whole workspace'}</span>
          </div>
          <button
            className="translation-command"
            disabled={!connected || agent.busy || !agent.settings.code}
            onClick={() => send('canvas-to-code')}
          >
            <Frame size={16} />
            <span>Canvas to code</span>
            <ArrowRight size={16} />
          </button>
          <button
            className="translation-command"
            disabled={!connected || agent.busy || !agent.settings.canvas}
            onClick={() => send('code-to-canvas')}
          >
            <Code2 size={16} />
            <span>Code to canvas</span>
            <ArrowRight size={16} />
          </button>
          <label className="toggle-row">
            <span>Keep both in sync</span>
            <input
              aria-label="Keep both in sync"
              type="checkbox"
              disabled={!connected}
              checked={agent.settings.auto}
              onChange={(e) => settings({ auto: e.target.checked })}
            />
          </label>
        </section>
        <section className="agent-permissions">
          <div className="agent-section-title">
            <h3>
              <ShieldCheck size={13} />
              Permissions
            </h3>
            <span>This room</span>
          </div>
          <label>
            <input
              type="checkbox"
              disabled={!connected}
              checked={agent.settings.canvas}
              onChange={(e) => settings({ canvas: e.target.checked })}
            />
            Edit canvas
          </label>
          <label>
            <input
              type="checkbox"
              disabled={!connected}
              checked={agent.settings.code}
              onChange={(e) => settings({ code: e.target.checked })}
            />
            Edit code
          </label>
        </section>
        <section className="agent-activity">
          <div className="agent-section-title">
            <h3>Activity</h3>
            {agent.busy && (
              <IconButton
                label="Cancel generation"
                onClick={() => w.provider.command({ action: 'cancel' })}
              >
                <Square size={12} />
              </IconButton>
            )}
          </div>
          {!agent.events.length && (
            <div className="agent-idle">
              <span className="agent-idle-mark">
                <Frame size={20} />
                <ArrowRight size={14} />
                <Code2 size={20} />
              </span>
              <strong>One workspace. Two ways to think.</strong>
              <span>
                {agent.engine === 'workers-ai'
                  ? 'Ready for your next idea.'
                  : 'Canvas and code translation are ready.'}
              </span>
            </div>
          )}
          {agent.events.map((event) => (
            <article key={event.id} className={'agent-event ' + event.status}>
              <div className="event-icon">
                {event.status === 'applied' ? (
                  <Check size={13} />
                ) : event.status === 'error' || event.status === 'discarded' ? (
                  <CircleAlert size={13} />
                ) : event.status === 'running' ? (
                  <Loader2 size={13} className="spin" />
                ) : (
                  <Clock3 size={13} />
                )}
              </div>
              <div>
                <div className="event-title">
                  <strong>
                    {event.direction === 'canvas-to-code'
                      ? 'Canvas to code'
                      : event.direction === 'code-to-canvas'
                        ? 'Code to canvas'
                        : 'Agent request'}
                  </strong>
                  <span>
                    {new Date(event.at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p>{event.message}</p>
                <span className="event-state">{event.status}</span>
              </div>
            </article>
          ))}
          {agent.events.some(
            (event) => event.status === 'applied' && event.direction !== 'canvas-to-code',
          ) && (
            <button className="view-agent-result" onClick={openCanvas}>
              <LocateFixed size={14} />
              View canvas result
            </button>
          )}
        </section>
      </div>
      <form
        className="agent-composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (prompt.trim()) send('prompt');
        }}
      >
        {agent.engine === 'structural' && (
          <div className="agent-connection-note">
            <span className="status-dot" />
            Workers AI not connected
          </div>
        )}
        <textarea
          aria-label="Message the agent"
          placeholder="Ask for a change..."
          value={prompt}
          maxLength={4000}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && prompt.trim()) {
              e.preventDefault();
              if (connected && !agent.busy && agent.engine === 'workers-ai') send('prompt');
            }
          }}
        />
        <div className="composer-footer">
          <span>{agent.engine === 'workers-ai' ? 'Workers AI' : 'AST translator'}</span>
          <button
            className="agent-send"
            aria-label="Send agent message"
            disabled={!prompt.trim() || !connected || agent.busy || agent.engine !== 'workers-ai'}
          >
            <Send size={14} />
          </button>
        </div>
      </form>
      <div className="agent-footnote">
        <ArrowDown size={11} />
        {agent.busy
          ? 'Changes are checked before applying'
          : 'Changes appear for everyone in this room'}
      </div>
    </aside>
  );
}
