import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Gateway } from "@/lib/gateway";
import type { PartySummary } from "@/lib/campaign-types";
import {
  emptyCombat,
  nextTurn,
  sortInitiative,
  type Combat,
} from "@/lib/party-tools";
import { useLanguage } from "./language";
export default function PartyInitiative({
  gateway,
  campaignId,
  dm,
  summaries,
  report,
  registerLeave,
}: {
  gateway: Gateway;
  campaignId: string;
  dm: boolean;
  summaries: PartySummary[];
  report: (s: string) => void;
  registerLeave: (fn: () => Promise<boolean>) => void;
}) {
  const { localize, t } = useLanguage();
  const [live, setLive] = useState<Combat>(emptyCombat),
    [draft, setDraft] = useState<Combat>(emptyCombat),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  useEffect(
    () =>
      gateway.watchCombat(
        campaignId,
        (c) => {
          setLive(c);
          setLoaded(true);
        },
        (e) => report(e.message),
      ),
    [gateway, campaignId],
  );
  useEffect(() => {
    if (!dirty) setDraft(live);
  }, [live, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function change(value: Combat) {
    setDraft(value);
    setDirty(true);
  }
  async function save(value: Combat) {
    setBusy(true);
    try {
      await gateway.saveCombat(campaignId, value);
      setDirty(false);
      return true;
    } catch (e) {
      report((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    registerLeave(async () => {
      if (busy) return false;
      if (!dirty) return true;
      return save(draft);
    });
    return () => registerLeave(async () => true);
  }, [dirty, draft, busy, registerLeave]);
  function add(names: string[]) {
    const entries = [
      ...draft.entries,
      ...names
        .slice(0, 40 - draft.entries.length)
        .map((name) => ({
          id: crypto.randomUUID(),
          name,
          initiative: 0,
          order: 0,
          conditions: "",
        })),
    ].map((e, order) => ({ ...e, order }));
    change({ ...draft, entries });
  }
  const display = dm ? draft : live,
    entries = sortInitiative(display.entries),
    conflict = dirty && live.revision !== draft.revision;
  return localize(
    <section className="dm-section initiative-section">
      <div className="section-heading">
        <div>
          <h2>Initiative</h2>
          <p className="muted">Shared turn order. The DM controls combat.</p>
        </div>
        <span className="badge">
          {t("Round")} {display.round}
        </span>
      </div>
      {!loaded ? (
        <p role="status">Loading initiative…</p>
      ) : (
        <>
          <div className="party-table-wrap">
            <table className="party-table initiative-table">
              <thead>
                <tr>
                  <th>Turn</th>
                  <th>Name</th>
                  <th>Initiative</th>
                  <th>Tie order</th>
                  <th>Conditions / notes</th>
                  {dm && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr
                    key={e.id}
                    className={display.activeId === e.id ? "active-turn" : ""}
                  >
                    <td>
                      {display.activeId === e.id ? (
                        <span aria-label={t("Current turn")}>▶</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {dm ? (
                        <Input
                          aria-label={`${t("Name")}: ${e.name}`}
                          value={e.name}
                          maxLength={100}
                          onChange={(v) =>
                            change({
                              ...draft,
                              entries: draft.entries.map((x) =>
                                x.id === e.id
                                  ? { ...x, name: v.target.value }
                                  : x,
                              ),
                            })
                          }
                        />
                      ) : (
                        e.name
                      )}
                    </td>
                    <td>
                      {dm ? (
                        <Input
                          aria-label={`${t("Initiative")}: ${e.name}`}
                          type="number"
                          min={-30}
                          max={100}
                          value={e.initiative}
                          onChange={(v) =>
                            change({
                              ...draft,
                              entries: draft.entries.map((x) =>
                                x.id === e.id
                                  ? { ...x, initiative: Number(v.target.value) }
                                  : x,
                              ),
                            })
                          }
                        />
                      ) : (
                        e.initiative
                      )}
                    </td>
                    <td>
                      {dm ? (
                        <Input
                          aria-label={`${t("Tie order")}: ${e.name}`}
                          type="number"
                          min={0}
                          max={1000}
                          value={e.order}
                          onChange={(v) =>
                            change({
                              ...draft,
                              entries: draft.entries.map((x) =>
                                x.id === e.id
                                  ? { ...x, order: Number(v.target.value) }
                                  : x,
                              ),
                            })
                          }
                        />
                      ) : (
                        e.order
                      )}
                    </td>
                    <td>
                      {dm ? (
                        <Input
                          aria-label={`${t("Conditions / notes")}: ${e.name}`}
                          value={e.conditions}
                          maxLength={200}
                          onChange={(v) =>
                            change({
                              ...draft,
                              entries: draft.entries.map((x) =>
                                x.id === e.id
                                  ? { ...x, conditions: v.target.value }
                                  : x,
                              ),
                            })
                          }
                        />
                      ) : (
                        e.conditions || "—"
                      )}
                    </td>
                    {dm && (
                      <td>
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            change({
                              ...draft,
                              entries: draft.entries.filter(
                                (x) => x.id !== e.id,
                              ),
                              activeId:
                                draft.activeId === e.id ? "" : draft.activeId,
                            })
                          }
                        >
                          Remove
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!entries.length && (
            <p className="muted">
              No combatants yet. Add the party and any creatures, then enter
              their initiative rolls.
            </p>
          )}
          {dm && (
            <>
              <p className="small muted">
                Higher initiative goes first. For ties, the smaller tie order
                goes first. Save edits before advancing a turn.
              </p>
              <div className="button-row">
                <Button
                  variant="outline"
                  disabled={busy || draft.entries.length >= 40}
                  onClick={() => add(["New combatant"])}
                >
                  Add combatant
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    busy || !summaries.length || draft.entries.length >= 40
                  }
                  onClick={() =>
                    add(
                      summaries
                        .filter(
                          (s) => !draft.entries.some((e) => e.name === s.name),
                        )
                        .map((s) => s.name),
                    )
                  }
                >
                  Add party
                </Button>
                <Button
                  disabled={
                    busy ||
                    !dirty ||
                    conflict ||
                    draft.entries.some((e) => !e.name.trim())
                  }
                  onClick={() => void save(draft)}
                >
                  Save initiative
                </Button>
                {dirty && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setDirty(false);
                      setDraft(live);
                    }}
                  >
                    Reload tracker
                  </Button>
                )}
                <Button
                  disabled={busy || dirty || !live.entries.length}
                  onClick={() => void save(nextTurn(live))}
                >
                  {live.activeId ? "Next turn" : "Start combat"}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || dirty || !live.entries.length}
                  onClick={() =>
                    void save({
                      ...live,
                      round: 1,
                      activeId: sortInitiative(live.entries)[0].id,
                    })
                  }
                >
                  Reset round
                </Button>
              </div>
              {conflict && (
                <p role="alert" className="error">
                  Initiative changed on another device. Reload the tracker to
                  use the latest order.
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>,
  );
}
