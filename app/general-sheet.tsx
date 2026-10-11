import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  abilityNames,
  mod,
  proficiency,
  signed,
  skills,
  type Character,
  type CustomSpell,
} from "@/lib/rules";
import { castCustom, newCharacter } from "@/lib/custom-character";
import { legacyWallet } from "@/lib/wallet";
import { useLanguage } from "./language";
import WalletPanel from "./wallet-panel";
import { CharacterImageEditor } from "./character-image";
import type { SheetHandle, SheetStore } from "./sheet";
function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 1000000,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="field">
      {label}
      <Input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          if (e.target.value !== "")
            onChange(
              Math.max(
                min,
                Math.min(max, Math.floor(Number(e.target.value) || 0)),
              ),
            );
        }}
      />
    </label>
  );
}
export default function GeneralSheet({
  store,
  onHandle,
}: {
  store: SheetStore;
  onHandle?: (handle: SheetHandle) => void;
}) {
  const seed = newCharacter();
  const { localize, t } = useLanguage();
  const [c, setC] = useState<Character>(seed),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState("Loading saved sheet…"),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [notice, setNotice] = useState(""),
    [tab, setTab] = useState("sheet");
  const revision = useRef(0),
    lastSaved = useRef(""),
    busy = useRef(false),
    dirty = useRef(false),
    latest = useRef(c),
    readyRef = useRef(false),
    saveFailed = useRef(false),
    saveInFlight = useRef<Promise<boolean> | null>(null);
  latest.current = c;
  async function load() {
    setReady(false);
    readyRef.current = false;
    setError("");
    setStatus("Loading saved sheet…");
    try {
      const d = await store.load();
      const loaded = { ...seed, ...(d.character || {}) };
      loaded.wallets = loaded.wallets || [legacyWallet(loaded.coins)];
      setC(loaded);
      latest.current = loaded;
      revision.current = d.revision;
      lastSaved.current = JSON.stringify(loaded);
      saveFailed.current = false;
      setReady(true);
      readyRef.current = true;
      setStatus(
        d.character ? "All changes saved" : "Ready · saves when edited",
      );
    } catch (e) {
      setError((e as Error).message);
      setStatus("Sheet unavailable");
    }
  }
  function save(): Promise<boolean> {
    if (!readyRef.current) return Promise.resolve(false);
    if (saveInFlight.current) {
      dirty.current = true;
      return saveInFlight.current.then((ok) => (ok ? save() : false));
    }
    if (
      revision.current > 0 &&
      JSON.stringify(latest.current) === lastSaved.current
    ) {
      setStatus("All changes saved");
      return Promise.resolve(true);
    }
    busy.current = true;
    dirty.current = false;
    setSaving(true);
    setStatus("Saving…");
    const snapshot = JSON.stringify(latest.current);
    const request = (async () => {
      try {
        const d = await store.save(JSON.parse(snapshot), revision.current);
        revision.current = d.revision;
        lastSaved.current = snapshot;
        saveFailed.current = false;
        setError("");
        setStatus(
          JSON.stringify(latest.current) === snapshot
            ? "All changes saved"
            : "Unsaved changes",
        );
        return true;
      } catch (e) {
        saveFailed.current = true;
        setError((e as Error).message);
        setStatus("Unsaved changes");
        return false;
      } finally {
        busy.current = false;
        saveInFlight.current = null;
        setSaving(false);
      }
    })();
    saveInFlight.current = request;
    return request.then((ok) =>
      ok &&
      (dirty.current || JSON.stringify(latest.current) !== lastSaved.current)
        ? save()
        : ok,
    );
  }
  async function saveManually() {
    if (await save())
      setNotice(
        `${latest.current.name} saved at level ${latest.current.level}.`,
      );
    else
      setNotice(
        "Changes are not saved yet. Check the message above and retry.",
      );
  }

  useEffect(() => {
    let alive = true;
    void load();
    const stop = store.subscribe?.(
      (record) => {
        if (
          !alive ||
          !readyRef.current ||
          record.revision <= revision.current ||
          busy.current
        )
          return;
        if (JSON.stringify(latest.current) !== lastSaved.current) {
          saveFailed.current = true;
          setError(
            "This sheet changed on another device. Export your edits, then reload before saving.",
          );
          setStatus("Save conflict");
          return;
        }
        const loaded = { ...seed, ...record.character };
        loaded.wallets = loaded.wallets || [legacyWallet(loaded.coins)];
        revision.current = record.revision;
        lastSaved.current = JSON.stringify(loaded);
        latest.current = loaded;
        setC(loaded);
        setStatus("All changes saved");
      },
      (e) => {
        setError(e.message);
        setStatus("Connection unavailable");
      },
    );
    return () => {
      alive = false;
      stop?.();
    };
  }, [store]);
  useEffect(() => {
    onHandle?.({
      save,
      isDirty: () =>
        readyRef.current &&
        JSON.stringify(latest.current) !== lastSaved.current,
    });
  }, [store]);
  useEffect(() => {
    if (!ready || saveFailed.current) return;
    const t = setTimeout(() => void save(), 600);
    return () => clearTimeout(t);
  }, [c, ready]);
  useEffect(() => {
    function warn(e: BeforeUnloadEvent) {
      if (
        readyRef.current &&
        JSON.stringify(latest.current) !== lastSaved.current
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  function change(patch: Partial<Character>, log?: string) {
    if (!readyRef.current) return;
    const result = { ...latest.current, ...patch };
    if (result.hp === 0) result.concentration = "";
    if (latest.current.hp === 0 && result.hp > 0) {
      result.deathSuccess = 0;
      result.deathFailure = 0;
    }
    if (log) result.log = [log, ...latest.current.log].slice(0, 20);
    setC(result);
    latest.current = result;
    if (!busy.current) setStatus("Unsaved changes");
  }
  const prof = proficiency(c.level),
    spellMod = mod(c.scores[c.spellAbility ?? 4]),
    spells = c.customSpells || [],
    slots = c.slotMax || Array(9).fill(0);
  function text(label: string, key: keyof Character, max = 100) {
    return (
      <label className="field">
        {label}
        <Input
          dir="auto"
          aria-label={t(label)}
          maxLength={max}
          value={String(c[key] ?? "")}
          onChange={(e) => change({ [key]: e.target.value })}
        />
      </label>
    );
  }
  function narrative(label: string, key: keyof Character, max: number) {
    return (
      <label className="field">
        {label}
        <textarea
          dir="auto"
          aria-label={t(label)}
          maxLength={max}
          rows={6}
          value={String(c[key] ?? "")}
          onChange={(e) => change({ [key]: e.target.value })}
        />
      </label>
    );
  }
  function updateSpell(id: string, patch: Partial<CustomSpell>) {
    change({
      customSpells: spells.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  }
  function cast(s: CustomSpell, slot: number) {
    try {
      const next = castCustom(latest.current, s, slot);
      change({
        spent: next.spent,
        concentration: next.concentration,
        log: next.log,
      });
      setNotice(`Cast ${s.name}. Resolve its effects at the table.`);
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  function backup() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { version: 1, type: "custom", character: latest.current },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "character-backup.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return localize(
    <main className="general-sheet sheet-main">
      <header className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">GENERAL CHARACTER SHEET</p>
            <h1 dir="auto">{c.name}</h1>
            <p dir="auto">
              {[c.species,c.className,c.subclass,c.rulesEdition,`Level ${c.level}`].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="button-row">
            <Button
              disabled={!ready || saving}
              onClick={() => void saveManually()}
            >
              Save
            </Button>
            <Button variant="outline" onClick={backup}>
              Backup
            </Button>
          </div>
        </div>
        <p role="status">{t(status)}</p>
        <p className="small muted">
          Class features, spell limits and level-up choices are reviewed with
          your DM. This sheet does not apply cleric or bard rules automatically.
        </p>
        {error && (
          <div className="error" role="alert">
            {error}
            <Button
              variant="outline"
              onClick={() => {
                if (
                  (!dirty.current &&
                    JSON.stringify(latest.current) === lastSaved.current) ||
                  confirm(
                    t(
                      "Export your unsaved edits before reloading. Reload now?",
                    ),
                  )
                )
                  void load();
              }}
            >
              Reload saved sheet
            </Button>
          </div>
        )}
        {notice && <p role="status">{notice}</p>}
      </header>
      <nav className="campaign-nav" aria-label={t("Character sections")}>
        {[
          ["sheet", "Character sheet"],
          ["spells", "Spellbook"],
          ["level", "Level up"],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-current={tab === key ? "page" : undefined}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <fieldset disabled={!ready}>
        {tab === "sheet" && (
          <>
            <section className="panel">
              <h2>Identity & vitals</h2>
              <CharacterImageEditor
                image={c.image}
                name={c.name}
                disabled={!ready}
                onChange={(image) => change({ image })}
              />
              <div className="fields">
                {text("Character name", "name")}
                {text("Player", "player")}
                {text("Class", "className")}
                {text("Species", "species")}
                {text("Subclass", "subclass")}
                {text("Background", "background")}
                {text("Alignment", "alignment")}
                <label className="field">
                  Rules edition
                  <select
                    value={c.rulesEdition || "2014"}
                    onChange={(e) =>
                      change({
                        rulesEdition: e.target
                          .value as Character["rulesEdition"],
                      })
                    }
                  >
                    <option value="2014">2014</option>
                    <option value="2024">2024</option>
                    <option value="custom">Custom / homebrew</option>
                  </select>
                </label>
                <NumberField
                  label="Current HP"
                  value={c.hp}
                  onChange={(hp) => change({ hp })}
                />
                <NumberField
                  label="Maximum HP"
                  min={1}
                  value={c.maxHP}
                  onChange={(maxHP) => change({ maxHP })}
                />
                <NumberField
                  label="Temporary HP"
                  value={c.tempHP}
                  onChange={(tempHP) => change({ tempHP })}
                />
                <NumberField
                  label="Armor Class"
                  max={50}
                  value={c.ac}
                  onChange={(ac) => change({ ac })}
                />
                <NumberField
                  label="Speed (ft)"
                  max={500}
                  value={c.speed}
                  onChange={(speed) => change({ speed })}
                />
                <NumberField
                  label="XP"
                  max={100000000}
                  value={c.xp}
                  onChange={(xp) => change({ xp })}
                />
                <NumberField
                  label="Hit Dice spent"
                  max={20}
                  value={c.hitDiceSpent}
                  onChange={(hitDiceSpent) => change({ hitDiceSpent })}
                />
                <NumberField
                  label="Death save successes"
                  max={3}
                  value={c.deathSuccess}
                  onChange={(deathSuccess) => change({ deathSuccess })}
                />
                <NumberField
                  label="Death save failures"
                  max={3}
                  value={c.deathFailure}
                  onChange={(deathFailure) => change({ deathFailure })}
                />
              </div>
            </section>
            <section className="panel">
              <h2>Ability scores</h2>
              <p>Proficiency bonus {signed(prof)}</p>
              <div className="fields">
                {abilityNames.map((n, i) => (
                  <NumberField
                    key={n}
                    label={`${n} (${signed(mod(c.scores[i]))})`}
                    value={c.scores[i]}
                    min={1}
                    max={30}
                    onChange={(value) =>
                      change({
                        scores: c.scores.map((s, j) => (i === j ? value : s)),
                      })
                    }
                  />
                ))}
              </div>
              <h3>Skills & saving throws</h3>
              <div className="fields">
                {skills.map(([name, index]) => (
                  <div key={name}>
                    <label>
                      <input
                        type="checkbox"
                        checked={c.proficient.includes(name)}
                        onChange={(e) =>
                          change({
                            proficient: e.target.checked
                              ? [...c.proficient, name]
                              : c.proficient.filter((n) => n !== name),
                            expertise: (c.expertise || []).filter(
                              (n) => n !== name,
                            ),
                          })
                        }
                      />
                      {name}{" "}
                      {signed(
                        mod(c.scores[index]) +
                          (c.proficient.includes(name)
                            ? prof *
                              ((c.expertise || []).includes(name) ? 2 : 1)
                            : 0),
                      )}
                    </label>
                    <label className="small">
                      <input
                        type="checkbox"
                        aria-label={`${t("Expertise")}: ${t(name)}`}
                        disabled={
                          !c.proficient.includes(name) ||
                          (!(c.expertise || []).includes(name) &&
                            (c.expertise || []).length >= 4)
                        }
                        checked={(c.expertise || []).includes(name)}
                        onChange={(e) =>
                          change({
                            expertise: e.target.checked
                              ? [...(c.expertise || []), name]
                              : (c.expertise || []).filter((n) => n !== name),
                          })
                        }
                      />
                      Expertise
                    </label>
                  </div>
                ))}
              </div>
              <div className="fields">
                {abilityNames.map((name, index) => (
                  <label key={name}>
                    <input
                      type="checkbox"
                      checked={c.saveProf.includes(index)}
                      onChange={(e) =>
                        change({
                          saveProf: e.target.checked
                            ? [...c.saveProf, index]
                            : c.saveProf.filter((i) => i !== index),
                        })
                      }
                    />
                    {name} save{" "}
                    {signed(
                      mod(c.scores[index]) +
                        (c.saveProf.includes(index) ? prof : 0),
                    )}
                  </label>
                ))}
              </div>
            </section>
            <section className="panel">
              <h2>Equipment & story</h2>
              {narrative("Features, attacks & resources", "features", 20000)}
              {narrative("Equipment", "equipment", 10000)}
              {text("Languages & proficiencies", "languages", 1000)}
              {narrative("Backstory", "backstory", 15000)}
              {narrative("Notes, background & feats", "notes", 20000)}
              {text("Original coins", "coins", 1000)}
            </section>
            <WalletPanel
              ready={ready}
              wallets={c.wallets || [legacyWallet(c.coins)]}
              originalCoins={c.coins}
              defaultCurrencyId={c.defaultCurrencyId}
              onDefaultChange={(defaultCurrencyId) =>
                change({ defaultCurrencyId })
              }
              onChange={(wallets, log) => change({ wallets }, log)}
            />
          </>
        )}
        {tab === "spells" && (
          <>
            <section className="panel">
              <h2>Spell slots</h2>
              <p className="small muted">
                Enter confirmed slot totals and uses. Special resources and
                recharge rules belong in Features.
              </p>
              <label className="field">
                Spellcasting ability
                <select
                  value={c.spellAbility ?? 4}
                  onChange={(e) =>
                    change({ spellAbility: Number(e.target.value) })
                  }
                >
                  {abilityNames.map((n, i) => (
                    <option key={n} value={i}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                Save DC {8 + prof + spellMod} · Attack {signed(prof + spellMod)}
              </p>
              <div className="fields">
                {slots.map((total, i) => (
                  <div key={i}>
                    <NumberField
                      label={`Level ${i + 1} slots`}
                      max={20}
                      value={total}
                      onChange={(value) =>
                        change({
                          slotMax: slots.map((n, j) => (i === j ? value : n)),
                        })
                      }
                    />
                    <NumberField
                      label={`Level ${i + 1} slots spent`}
                      max={20}
                      value={c.spent[i]}
                      onChange={(value) =>
                        change({
                          spent: c.spent.map((n, j) => (i === j ? value : n)),
                        })
                      }
                    />
                    <p>{Math.max(0, total - c.spent[i])} available</p>
                  </div>
                ))}
              </div>
              {text("Concentration", "concentration")}
              <Button
                variant="outline"
                disabled={!c.concentration}
                onClick={() => change({ concentration: "" })}
              >
                End concentration
              </Button>
            </section>
            <section className="panel">
              <h2>Ready to cast</h2>
              <div className="spell-cards">
                {spells
                  .filter((s) => s.prepared)
                  .map((s) => (
                    <ReadySpell
                      key={s.id}
                      spell={s}
                      slots={slots}
                      spent={c.spent}
                      cast={(slot) => cast(s, slot)}
                    />
                  ))}
              </div>
              {!spells.length && <p>No spells recorded.</p>}
            </section>
            <section className="panel">
              <div className="section-heading">
                <h2>Spell library</h2>
                <Button
                  disabled={spells.length >= 60}
                  onClick={() =>
                    change({
                      customSpells: [
                        ...spells,
                        {
                          id: crypto.randomUUID(),
                          name: "New spell",
                          level: 0,
                          prepared: true,
                          description: "",
                          concentration: false,
                        },
                      ],
                    })
                  }
                >
                  Add spell
                </Button>
              </div>
              <p className="small muted">
                All imported spells remain visible. Ready spells and known
                cantrips can be cast above. Confirm class-specific preparation
                limits with your DM.
              </p>
              {spells.map((s) => (
                <details key={s.id}>
                  <summary>
                    {s.name} · {s.level === 0 ? "Cantrip" : `Level ${s.level}`}{" "}
                    · {s.prepared ? "Ready" : "Unprepared"}
                  </summary>
                  <label className="field">
                    Spell name
                    <Input
                      maxLength={100}
                      value={s.name}
                      onChange={(e) =>
                        updateSpell(s.id, { name: e.target.value })
                      }
                    />
                  </label>
                  <NumberField
                    label="Spell level"
                    max={9}
                    value={s.level}
                    onChange={(level) => updateSpell(s.id, { level })}
                  />
                  <label>
                    <input
                      type="checkbox"
                      checked={s.prepared}
                      onChange={(e) =>
                        updateSpell(s.id, { prepared: e.target.checked })
                      }
                    />
                    Ready to cast
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={s.concentration}
                      onChange={(e) =>
                        updateSpell(s.id, { concentration: e.target.checked })
                      }
                    />
                    Concentration
                  </label>
                  <label className="field">
                    Spell notes
                    <textarea
                      maxLength={2000}
                      dir="auto"
                      rows={5}
                      value={s.description}
                      onChange={(e) =>
                        updateSpell(s.id, { description: e.target.value })
                      }
                    />
                  </label>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (confirm(t("Remove this spell from your library?")))
                        change({
                          customSpells: spells.filter((x) => x.id !== s.id),
                        });
                    }}
                  >
                    Remove spell
                  </Button>
                </details>
              ))}
            </section>
          </>
        )}
        {tab === "level" && (
          <section className="panel">
            <h2>Level up</h2>
            <p>
              Review changes with your DM before editing the sheet. Your class
              progression is not automated in general mode.
            </p>
            <ol>
              <li>Confirm the new class level, subclass and rules edition.</li>
              <li>
                Roll or choose HP, update maximum HP and review Constitution
                adjustments.
              </li>
              <li>
                Add class features, resource limits, feats and ability
                improvements.
              </li>
              <li>
                Update known cantrips, spells and slot totals from your class
                table.
              </li>
              <li>
                Review proficiency, skills, equipment and any house rules.
              </li>
            </ol>
            <NumberField
              label="Character level"
              min={1}
              max={20}
              value={c.level}
              onChange={(level) =>
                change(
                  { level },
                  `Character level set to ${level}; class choices require review.`,
                )
              }
            />
            <p>
              Changing level updates the proficiency bonus. It does not grant
              HP, spells or features automatically.
            </p>
            <Button onClick={() => void saveManually()}>Save</Button>
          </section>
        )}
      </fieldset>
      <section className="panel">
        <h2>Recent actions</h2>
        {c.log.slice(0, 6).map((entry, i) => (
          <p key={i} dir="auto">
            {entry}
          </p>
        ))}
      </section>
    </main>,
  );
}
function ReadySpell({
  spell,
  slots,
  spent,
  cast,
}: {
  spell: CustomSpell;
  slots: number[];
  spent: number[];
  cast: (slot: number) => void;
}) {
  const { localize } = useLanguage();
  const [slot, setSlot] = useState(String(spell.level || 1));
  const available = slots.flatMap((total, i) =>
    i + 1 >= spell.level && total > spent[i] ? [i + 1] : [],
  );
  const chosen = available.includes(Number(slot)) ? Number(slot) : available[0];
  return localize(
    <article className="spell-card">
      <h3 dir="auto">{spell.name}</h3>
      <p>
        {spell.level === 0 ? "Cantrip" : `Level ${spell.level}`}
        {spell.concentration ? " · Concentration" : ""}
      </p>
      <p dir="auto">{spell.description}</p>
      {spell.level > 0 && (
        <label className="field">
          Cast using slot
          <select
            value={chosen || ""}
            onChange={(e) => setSlot(e.target.value)}
          >
            {!available.length && <option value="">No available slots</option>}
            {available.map((level) => (
              <option key={level} value={level}>
                Level {level}
              </option>
            ))}
          </select>
        </label>
      )}
      <Button
        disabled={spell.level > 0 && !chosen}
        onClick={() => cast(chosen || 0)}
      >
        Cast
      </Button>
    </article>,
  );
}
