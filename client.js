window.__ModuleLoader__.load({
  id: 'dsh-ladder-superagents',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useState } = React

    // Only the host's alias tokens: they switch with the theme, and a renamed
    // token degrades the look instead of breaking the page.
    const color = {
      text: 'var(--dsw-alias-label-primary, inherit)',
      muted: 'var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9))',
      border: 'var(--dsw-alias-border-l1, rgba(128, 128, 128, 0.25))',
      surface: 'var(--dsw-alias-bg-layer-1, transparent)',
      brand: 'var(--dsw-alias-brand-primary, #4b6bfb)',
      ok: 'var(--dsw-alias-state-success-primary, #2f9e44)',
      bad: 'var(--dsw-alias-state-error-primary, #c92a2a)',
      warn: 'var(--dsw-alias-state-warn-primary, #b7791f)',
    }

    const s = {
      page: { display: 'flex', flexDirection: 'column', gap: 16, color: color.text, paddingBottom: 8 },
      head: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
      title: { fontSize: 15, fontWeight: 600, lineHeight: '22px' },
      sub: { fontSize: 12, color: color.muted, lineHeight: '18px', wordBreak: 'break-word' },
      card: {
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: 12,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      },
      section: { display: 'flex', flexDirection: 'column', gap: 8 },
      sectionTitle: { fontSize: 13, fontWeight: 600, lineHeight: '20px' },
      tier: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: 12,
        padding: '12px 14px',
      },
      rank: { width: 28, textAlign: 'center', fontSize: 12, color: color.muted, lineHeight: '20px' },
      body: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
      tierTitle: { fontSize: 13, fontWeight: 600, lineHeight: '20px' },
      meta: { fontSize: 12, color: color.muted, lineHeight: '18px', wordBreak: 'break-word' },
      fail: { fontSize: 12, color: color.bad, lineHeight: '18px' },
      actions: { display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 },
      state: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: color.muted, lineHeight: '20px', minWidth: 64 },
      dot: (on) => ({ width: 7, height: 7, borderRadius: '50%', background: on ? color.ok : color.bad, flexShrink: 0 }),
      btn: {
        fontSize: 12,
        height: 26,
        lineHeight: '24px',
        padding: '0 10px',
        borderRadius: 8,
        border: `1px solid ${color.border}`,
        background: 'transparent',
        color: color.text,
        cursor: 'pointer',
        flexShrink: 0,
      },
      btnIcon: {
        width: 26,
        height: 26,
        padding: 0,
        borderRadius: 8,
        border: `1px solid ${color.border}`,
        background: 'transparent',
        color: color.text,
        cursor: 'pointer',
        fontSize: 12,
        lineHeight: '24px',
        flexShrink: 0,
      },
      btnPrimary: {
        fontSize: 12,
        height: 26,
        lineHeight: '24px',
        padding: '0 12px',
        borderRadius: 8,
        border: 'none',
        background: color.brand,
        color: '#ffffff',
        cursor: 'pointer',
        flexShrink: 0,
      },
      input: {
        height: 28,
        fontSize: 12,
        padding: '0 8px',
        borderRadius: 8,
        border: `1px solid ${color.border}`,
        background: 'transparent',
        color: color.text,
        minWidth: 0,
      },
      row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
      chip: {
        fontSize: 11,
        lineHeight: '18px',
        padding: '0 6px',
        borderRadius: 6,
        border: `1px solid ${color.border}`,
        color: color.muted,
      },
      hint: { fontSize: 12, color: color.muted, lineHeight: '18px' },
      error: { fontSize: 12, color: color.bad, lineHeight: '18px' },
    }

    async function request(path, body) {
      const response = await fetch(path, body === undefined ? undefined : {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `request failed (${response.status})`)
      return data
    }

    function TierCard({ tier, onAction, onReorder, dragIndex, setDragIndex }) {
      const [confirming, setConfirming] = useState(false)
      useEffect(() => {
        if (!confirming) return undefined
        const timer = setTimeout(() => setConfirming(false), 3000)
        return () => clearTimeout(timer)
      }, [confirming])
      const toggle = () => onAction({ action: 'enable', id: tier.id, enabled: !tier.enabled })
      const move = (slot) => onAction({ action: 'move', id: tier.id, to: slot })
      return h('div', {
        draggable: true,
        onDragStart: (event) => {
          event.dataTransfer.setData('text/plain', tier.id)
          event.dataTransfer.effectAllowed = 'move'
          setDragIndex(tier.slot)
        },
        onDragEnd: () => setDragIndex(null),
        onDragOver: (event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
        },
        onDrop: (event) => {
          event.preventDefault()
          const id = event.dataTransfer.getData('text/plain')
          setDragIndex(null)
          if (id && id !== tier.id) onReorder(id, tier.slot)
        },
        style: dragIndex === tier.slot ? { ...s.tier, opacity: 0.4 } : s.tier,
      },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, paddingTop: 2 } },
        h('span', { style: { cursor: 'grab', color: color.muted, fontSize: 12 }, title: 'Drag to another slot' }, '⠿'),
        h('span', { style: s.rank }, `T${tier.slot}`)),
      h('div', { style: s.body },
        h('div', { style: s.tierTitle }, tier.label),
        h('div', { style: s.meta }, tier.route)),
      h('div', { style: s.state },
        h('span', { style: s.dot(tier.available && tier.enabled && !tier.failure) }),
        h('span', null, tier.failure ? 'failed' : tier.enabled ? (tier.available ? 'usable' : 'missing') : 'disabled')),
      h('div', { style: s.actions },
        h('button', { style: s.btnIcon, onClick: () => move(tier.slot - 1), disabled: tier.slot <= 1, title: 'Move up a tier' }, '↑'),
        h('button', { style: s.btnIcon, onClick: () => move(tier.slot + 1), disabled: tier.slot >= 10, title: 'Move down a tier' }, '↓'),
        h('button', { style: s.btn, onClick: toggle, title: tier.enabled ? 'Disable this tier' : 'Enable this tier' }, tier.enabled ? t('Off') : 'On'),
        tier.failure
          ? h('button', {
            style: { ...s.btn, color: color.bad },
            onClick: () => onAction({ action: 'retry', id: tier.id }),
            title: 'Probe this configuration once; it is enabled again only if it answers',
          }, 'Retry')
          : null,
        h('button', {
          style: confirming ? { ...s.btn, color: color.bad } : s.btnIcon,
          onClick: () => {
            if (confirming) onAction({ action: 'remove', id: tier.id })
            else setConfirming(true)
          },
          title: confirming ? 'Click again to remove this tier' : 'Remove this tier',
        }, confirming ? t('Sure?') : '✕')))
    }

    function Catalog({ catalog, llm, failures, busy, onScan, onPin, onAdd, canPinTiers }) {
      const [pending, setPending] = useState('')
      const [adding, setAdding] = useState('')
      const [verifiedOnly, setVerifiedOnly] = useState(false)
      const [confirming, setConfirming] = useState(null)
      const failedRoutes = new Set((failures ?? []).map((failure) => failure.route))
      const failedFor = (slug, effort) => failedRoutes.has(`codex ${slug}@${effort}`)
      const run = async (kind, body) => {
        setPending(kind)
        try {
          await onScan(body)
        } finally {
          setPending('')
        }
      }
      const scanned = catalog?.at ? new Date(catalog.at).toLocaleTimeString() : ''
      const verdictOf = (slug, effort) => catalog?.probes?.[`${slug}@${effort}`]
      const busyNow = busy || Boolean(pending)
      const pendingText = pending.startsWith('pin:')
        ? `Pinning ${pending.slice(4)} — one real call, this can take a minute…`
        : pending === 'pin-tiers'
          ? 'Pinning the ladder tiers — one real call each…'
          : 'Scanning `codex debug models`…'
      const verified = (model) => {
        const verdicts = model.efforts.map((effort) => verdictOf(model.slug, effort)).filter(Boolean)
        return verdicts.length > 0 && verdicts.every((verdict) => verdict.ok)
      }
      const allModels = catalog?.models ?? []
      const shownModels = verifiedOnly ? allModels.filter(verified) : allModels

      return h('div', { style: s.card },
        h('style', null, '@keyframes supaPulse{0%,100%{opacity:.35}50%{opacity:1}}'),
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } },
          h('div', { style: s.sectionTitle }, t('Codex model catalog')),
          h('div', { style: s.actions },
            h('label', {
              style: { display: 'flex', gap: 5, alignItems: 'center', fontSize: 12, color: color.muted, cursor: 'pointer' },
              title: 'Hide models that have not been pinned or that failed',
            },
            h('input', {
              type: 'checkbox',
              checked: verifiedOnly,
              onChange: (event) => setVerifiedOnly(event.target.checked),
            }),
            t('verified only')),
            h('button', {
              style: s.btn,
              onClick: () => run('scan', { action: 'scan' }),
              disabled: busyNow,
            }, t('Scan')),
            h('button', {
              style: canPinTiers ? s.btn : { ...s.btn, opacity: 0.4 },
              onClick: () => setConfirming({
                run: () => run('pin-tiers', { action: 'pin' }),
                text: 'Pinning the ladder tiers sends one real call per codex configuration in the ladder. Each call consumes that model\'s tokens/usage.',
              }),
              disabled: busyNow || !canPinTiers,
              title: canPinTiers
                ? 'Pin the codex tiers currently in the ladder'
                : 'The ladder has no CLI tier to pin — pin a catalog model instead',
            }, t('Pin tiers')))),
        pending
          ? h('div', {
            style: { fontSize: 12, color: color.muted, animation: 'supaPulse 1.2s ease-in-out infinite', padding: '8px 0' },
          }, pendingText)
          : catalog
            ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
              h('div', { style: s.hint },
                `${catalog.models.length} ${t('models')} · ${t('scanned')} ${scanned} · `
                + `${allModels.filter(verified).length} ${t('verified usable')}`),
              h('div', { style: { display: 'flex', gap: 14, alignItems: 'center', fontSize: 11, color: color.muted } },
                h('span', { style: { display: 'flex', gap: 5, alignItems: 'center' } }, h('span', { style: s.dot(true) }), t('pinned usable')),
                h('span', { style: { display: 'flex', gap: 5, alignItems: 'center' } }, h('span', { style: { ...s.dot(true), background: color.warn } }), t('scanned only')),
                h('span', { style: { display: 'flex', gap: 5, alignItems: 'center' } }, h('span', { style: s.dot(false) }), t('pin failed'))),
              shownModels.length === 0
                ? h('div', { style: s.hint }, verifiedOnly
                  ? t('nothing verified hint')
                  : 'The catalog is empty.')
                : null,
              ...shownModels.map((model) => {
                const verdicts = model.efforts.map((effort) => verdictOf(model.slug, effort)).filter(Boolean)
                const anyOk = verdicts.some((verdict) => verdict.ok)
                const anyFail = verdicts.some((verdict) => !verdict.ok)
                  || model.efforts.some((effort) => failedFor(model.slug, effort))
                const status = anyFail
                  ? { color: color.bad, label: 'a configuration failed' }
                  : anyOk
                    ? { color: color.ok, label: t('pinned usable') }
                    : { color: color.warn, label: t('scanned, not pinned') }
                return h('div', { key: model.slug, style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap' } },
                    h('span', {
                      style: { width: 7, height: 7, borderRadius: '50%', background: status.color, flexShrink: 0 },
                      title: status.label,
                    }),
                    h('span', { style: { fontSize: 12, minWidth: 150, color: color.text } }, model.slug),
                    h('span', { style: s.chip }, model.visibility || '?'),
                    h('span', { style: { ...s.meta, flex: 1 } },
                      model.efforts.map((effort) => {
                        const verdict = verdictOf(model.slug, effort)
                        return `${effort}${verdict ? (verdict.ok ? ' ✓' : ' ✕') : ''}`
                      }).join('  ') || 'no efforts'),
                    h('button', {
                      style: s.btn,
                      onClick: () => setConfirming({
                        run: () => run(`pin:${model.slug}`, { action: 'pin', model: model.slug }),
                        text: `Testing ${model.slug} sends one real call per effort (${model.efforts.join(', ')}). Each call consumes that model's tokens/usage.`,
                      }),
                      disabled: busyNow,
                      title: `Test every effort of ${model.slug}`,
                    }, t('Pin')),
                    h('button', {
                      style: s.btn,
                      onClick: () => setAdding(adding === model.slug ? '' : model.slug),
                      disabled: busyNow,
                      title: 'Add this model to the first free slot',
                    }, t('Add'))),
                  adding === model.slug
                    ? h('div', { style: { display: 'flex', gap: 6, alignItems: 'center', paddingLeft: 17, flexWrap: 'wrap' } },
                      h('span', { style: { fontSize: 11, color: color.muted } }, 'effort:'),
                      ...model.efforts.map((effort) => {
                        const verdict = verdictOf(model.slug, effort)
                        const blocked = Boolean((verdict && !verdict.ok) || failedFor(model.slug, effort))
                        return h('button', {
                          key: effort,
                          style: blocked ? { ...s.btn, opacity: 0.35, textDecoration: 'line-through' } : s.btn,
                          disabled: busyNow || blocked,
                          title: blocked ? `${effort} failed its pin` : `Add ${model.slug} at ${effort}`,
                          onClick: () => {
                            setAdding('')
                            onAdd({
                              action: 'add',
                              tier: {
                                label: `${model.slug} (${effort})`,
                                kind: 'cli',
                                driver: 'codex',
                                model: model.slug,
                                reasoningEffort: effort,
                              },
                            })
                          },
                        }, effort)
                      }))
                    : null)
              }))
            : h('div', { style: s.hint }, t('No catalog cached. Scan to read the model list.')),
        llm?.length
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 6 } },
            h('div', { style: s.hint }, t('Harness routes (read live from the llm service)')),
            ...llm.map((route) => h('div', {
              key: `${route.provider}/${route.model}`,
              style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'nowrap' },
            },
            h('span', { style: { fontSize: 12, minWidth: 210, color: color.text } }, `${route.provider}/${route.model}`),
            h('span', { style: s.chip }, route.defaultEffort ? `default effort ${route.defaultEffort}` : t('no default effort')),
            h('span', { style: { ...s.meta, flex: 1 } }, route.efforts.length ? `efforts ${route.efforts.join(' / ')}` : 'no reasoning metadata'),
            h('button', {
              style: s.btn,
              disabled: busyNow,
              title: 'This route needs no pin: the llm service already advertises it. Add it at its default effort.',
              onClick: () => onAdd({
                action: 'add',
                tier: {
                  label: `${route.model}${route.defaultEffort ? ` (${route.defaultEffort})` : ''}`,
                  kind: 'llm',
                  provider: route.provider,
                  model: route.model,
                  reasoningEffort: route.defaultEffort || undefined,
                },
              }),
            }, t('Add')))))
          : null,
        confirming
          ? h('div', {
            style: {
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 60,
            },
            onClick: () => setConfirming(null),
          },
          h('div', {
            style: { ...s.card, width: 380, maxWidth: '90vw', boxShadow: '0 12px 48px rgba(0,0,0,.28)' },
            onClick: (event) => event.stopPropagation(),
          },
          h('div', { style: s.sectionTitle }, t('This spends tokens')),
          h('div', { style: { fontSize: 12, color: color.muted, lineHeight: 1.6 } }, confirming.text),
          h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
            h('button', { style: s.btn, onClick: () => setConfirming(null) }, 'Cancel'),
            h('button', {
              style: { ...s.btn, color: color.warn },
              onClick: () => {
                const spec = confirming
                setConfirming(null)
                spec.run()
              },
            }, 'Continue'))))
          : null,
      )
    }

    function AddForm({ drivers, onAdd, disabled }) {
      const [kind, setKind] = useState('llm')
      const [label, setLabel] = useState('')
      const [provider, setProvider] = useState('')
      const [model, setModel] = useState('')
      const [effort, setEffort] = useState('')
      const [driver, setDriver] = useState('codex')
      const [ceiling, setCeiling] = useState('5')
      const [error, setError] = useState('')

      const submit = async () => {
        setError('')
        try {
          await onAdd({
            action: 'add',
            tier: {
              label: label || undefined,
              kind,
              driver: kind === 'cli' ? driver : undefined,
              provider: kind === 'llm' ? provider : undefined,
              model: model || undefined,
              reasoningEffort: effort || undefined,
              ceiling: Number(ceiling) || 5,
            },
          })
          setLabel('')
          setModel('')
          setEffort('')
        } catch (failure) {
          setError(String(failure.message ?? failure))
        }
      }

      return h('div', { style: s.card },
        h('div', { style: s.sectionTitle }, t('Add a tier')),
        h('div', { style: s.hint }, disabled
          ? t('all slots taken')
          : t('added to free slot')),
        h('div', { style: s.row },
          h('select', { style: s.input, value: kind, onChange: (event) => setKind(event.target.value) },
            h('option', { value: 'llm' }, 'llm'),
            h('option', { value: 'cli' }, 'cli')),
          kind === 'cli'
            ? h('select', { style: s.input, value: driver, onChange: (event) => setDriver(event.target.value) },
              ...drivers.map((name) => h('option', { key: name, value: name }, name)))
            : h('input', {
              style: { ...s.input, width: 150 },
              placeholder: 'provider',
              value: provider,
              onChange: (event) => setProvider(event.target.value),
            }),
          h('input', {
            style: { ...s.input, width: 150 },
            placeholder: 'model',
            value: model,
            onChange: (event) => setModel(event.target.value),
          }),
          h('input', {
            style: { ...s.input, width: 100 },
            placeholder: 'effort',
            value: effort,
            onChange: (event) => setEffort(event.target.value),
          }),
          h('input', {
            style: { ...s.input, flex: 1, minWidth: 160 },
            placeholder: 'label',
            value: label,
            onChange: (event) => setLabel(event.target.value),
          }),
          h('button', { style: disabled ? { ...s.btnPrimary, opacity: 0.4 } : s.btnPrimary, onClick: submit, disabled }, t('Add'))),
        error ? h('div', { style: s.error }, error) : null)
    }

    function Policy({ config, busy, onConfig }) {
      const [minutes, setMinutes] = useState('')
      const [children, setChildren] = useState('')
      useEffect(() => {
        setMinutes(String(Math.round((config?.failureCooldownMs ?? 0) / 60000)))
      }, [config?.failureCooldownMs])
      useEffect(() => {
        setChildren(String(config?.maxChildren ?? ''))
      }, [config?.maxChildren])

      // One shape for every row: label and control on one line, the explanation
      // under them as its own line. Inline hints wrap badly and make the card
      // look ragged.
      const control = { ...s.input, width: 190 }
      const field = (label, widget, hint) => h('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          padding: '9px 0',
          borderTop: `1px solid ${color.border}`,
        },
      },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
        h('span', { style: { fontSize: 12.5, minWidth: 76, color: color.text } }, label),
        widget),
      hint
        ? h('div', { style: { fontSize: 11.5, lineHeight: '17px', color: color.muted, paddingLeft: 86 } }, hint)
        : null)

      return h('div', { style: s.card },
        h('div', { style: s.sectionTitle }, t('Policy')),
        h('div', { style: s.hint }, t('saving hint')),
        field(t('Session scope'),
          h('select', {
            style: control,
            value: config.mode,
            disabled: busy,
            onChange: (event) => onConfig({ mode: event.target.value }),
          },
          h('option', { value: 'session' }, t('session (opt-in)')),
          h('option', { value: 'all' }, t('every session')),
          h('option', { value: 'root' }, t('root sessions only')),
          h('option', { value: 'preset' }, t('by preset'))),
          t('which sessions hint')),
        field(t('Approvals'),
          h('button', {
            style: s.btn,
            disabled: busy,
            onClick: () => onConfig({ autoApprove: !config.autoApprove }),
          }, config.autoApprove ? t('decide in-process') : t('ask the user')),
          config.autoApprove
            ? t('auto approve hint')
            : t('a request goes to the human through the approval prompt')),
        field(t('Authority ceiling'),
          h('select', {
            style: control,
            value: config.authority,
            disabled: busy,
            onChange: (event) => onConfig({ authority: event.target.value }),
          },
          h('option', { value: 'workspace' }, 'workspace'),
          h('option', { value: 'full' }, 'full')),
          t('the most a root SupA holds without asking the human')),
        field(t('Failure cooldown'),
          h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
            h('input', {
              style: { ...s.input, width: 76 },
              value: minutes,
              placeholder: t('minutes'),
              onChange: (event) => setMinutes(event.target.value),
            }),
            h('span', { style: { ...s.meta, fontSize: 11.5 } }, t('minutes')),
            h('button', {
              style: s.btn,
              disabled: busy,
              onClick: () => onConfig({ failureCooldownMinutes: Number(minutes) || 0 }),
            }, t('Apply'))),
          t('how long a failed tier stays out of rotation')),
        field(t('Fan-out'),
          h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
            h('input', {
              style: { ...s.input, width: 76 },
              value: children,
              onChange: (event) => setChildren(event.target.value),
            }),
            h('button', {
              style: s.btn,
              disabled: busy,
              onClick: () => onConfig({ maxChildren: Number(children) || 1 }),
            }, t('Apply'))),
          t('how many children may run at once')),
        field(t('Shell hand-off'),
          h('select', {
            style: control,
            value: config.handOffShell,
            disabled: busy,
            onChange: (event) => onConfig({ handOffShell: event.target.value }),
          },
          h('option', { value: 'blocking' }, t('sleeps and loops')),
          h('option', { value: 'long' }, t('sleeps, builds, tests')),
          h('option', { value: 'all' }, t('every shell command'))),
          t('which shell calls go to a worker instead of this turn')),
        field(t('Questions'),
          h('button', {
            style: s.btn,
            disabled: busy,
            onClick: () => onConfig({ denyBlockingQuestions: !config.denyBlockingQuestions }),
          }, config.denyBlockingQuestions ? t('refused') : t('allowed')),
          t('whether ask_user_question may pop the option dialog')),
      )
    }

    function SupaSettings() {
      const [state, setState] = useState(null)
      const [cwd, setCwd] = useState('')
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [dragIndex, setDragIndex] = useState(null)
      const [resetting, setResetting] = useState(false)
      const [manualOpen, setManualOpen] = useState(false)
      useEffect(() => {
        if (!resetting) return undefined
        const timer = setTimeout(() => setResetting(false), 3000)
        return () => clearTimeout(timer)
      }, [resetting])

      const load = useCallback(async (targetCwd) => {
        try {
          const query = targetCwd ? `?cwd=${encodeURIComponent(targetCwd)}` : ''
          const data = await request(`/supa/state${query}`)
          setState(data)
          setCwd(data.cwd)
          setError('')
        } catch (failure) {
          setError(String(failure.message ?? failure))
        }
      }, [])

      useEffect(() => {
        load()
      }, [load])

      const act = useCallback(async (body) => {
        setBusy(true)
        try {
          const data = await request('/supa/action', body)
          setState(data)
          setError('')
        } catch (failure) {
          setError(String(failure.message ?? failure))
        } finally {
          setBusy(false)
        }
      }, [])

      const configure = useCallback(async (changes) => {
        setBusy(true)
        try {
          await request('/supa/action', { action: 'config', ...changes })
          setError('')
          // The row is re-applied from the profile patch, so wait for the
          // plugin to come back before reading the new state.
          setTimeout(() => load(), 1400)
        } catch (failure) {
          setError(String(failure.message ?? failure))
        } finally {
          setBusy(false)
        }
      }, [load])

      const tiers = state?.tiers ?? []
      const reorder = useCallback((id, slot) => {
        if (id) act({ action: 'move', id, to: slot })
      }, [act])

      const summary = useMemo(() => {
        if (!state) return ''
        const usable = tiers.filter((tier) => tier.available && tier.enabled && !tier.failure).length
        return `${usable}/${tiers.length} ${t('usable')} · ${tiers.length}/10 ${t('tiers')} · ${t('autoApprove')} ${String(state.config.autoApprove)} · ${t('authority')} ${state.config.authority}`
      }, [state, tiers])

      if (error && !state) {
        return h('div', { style: s.page }, h('div', { style: s.error }, `dsh-ladder-superagents: ${error}`))
      }
      if (!state) {
        return h('div', { style: s.page }, h('div', { style: s.hint }, t('Loading dsh-ladder-superagents…')))
      }

      return h('div', { style: s.page },
        h('div', { style: s.head },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
            h('div', { style: s.title }, t('Model ladder')),
            h('div', { style: s.sub }, summary),
            h('div', { style: s.sub }, state.file)),
          h('div', { style: s.actions },
            h('button', {
              style: resetting ? { ...s.btn, color: color.bad } : s.btn,
              disabled: busy,
              onClick: () => {
                if (resetting) {
                  setResetting(false)
                  act({ action: 'reset' })
                } else {
                  setResetting(true)
                }
              },
              title: 'Replace the ladder with the built-in default (four thinking levels of one model)',
            }, resetting ? t('Sure?') : t('Reset')),
            h('button', { style: s.btn, onClick: () => load(cwd), disabled: busy }, t('Refresh')))),

        state.ladderReady === false
          ? h('div', { style: s.card },
            h('div', { style: s.sectionTitle }, t('T1 is empty')),
            h('div', { style: s.hint }, t('T1 is empty hint')))
          : null,

        h('div', { style: s.section },
          ...Array.from({ length: 10 }, (_, offset) => {
            const slot = offset + 1
            const tier = tiers.find((entry) => entry.slot === slot)
            return tier
              ? h(TierCard, {
                key: tier.id,
                tier,
                onAction: act,
                onReorder: reorder,
                dragIndex,
                setDragIndex,
              })
              : h('div', {
                key: `empty-${slot}`,
                style: { ...s.tier, borderStyle: 'dashed', opacity: 0.55 },
                onDragOver: (event) => event.preventDefault(),
                onDrop: (event) => {
                  event.preventDefault()
                  const id = event.dataTransfer.getData('text/plain')
                  if (id) reorder(id, slot)
                },
              },
              h('div', { style: { width: 28, textAlign: 'center', fontSize: 12, color: color.muted, lineHeight: '20px', paddingLeft: 12 } }, `T${slot}`),
              h('div', { style: s.body }, h('div', { style: s.meta }, t('empty slot — drag a tier here'))))
          })),

        h(Policy, { config: state.config, busy, onConfig: configure }),

        state.failures?.length
          ? h('div', { style: s.card },
            h('div', { style: s.sectionTitle }, t('Failed routes')),
            h('div', { style: s.hint }, 'A tier that failed in real use is removed from the ladder and its route is marked red in the catalog. Clear the mark once the problem is fixed.'),
            ...state.failures.map((failure) => h('div', {
              key: failure.key,
              style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap' },
            },
            h('span', { style: { color: color.bad, fontSize: 12 } }, '✕'),
            h('span', { style: { fontSize: 12, minWidth: 210, color: color.text } }, failure.label ?? failure.route),
            h('span', { style: { ...s.meta, flex: 1 } }, `${failure.route} · ${String(failure.error).slice(0, 120)}`),
            h('button', { style: s.btn, onClick: () => act({ action: 'clear', key: failure.key }) }, 'Clear'))))
          : null,

        h(Catalog, {
          catalog: state.catalog,
          llm: state.llm,
          failures: state.failures,
          busy,
          onScan: act,
          onPin: act,
          onAdd: act,
          canPinTiers: tiers.some((tier) => (tier.kind === 'cli' || tier.kind === 'codex') && tier.model),
        }),
        manualOpen
          ? h(AddForm, { drivers: state.drivers, onAdd: act, disabled: tiers.length >= 10 })
          : h('button', {
            style: { ...s.btn, alignSelf: 'flex-start' },
            onClick: () => setManualOpen(true),
            title: 'For a model that is in neither the codex catalog nor the live llm routes',
          }, t('Add a model manually')),

        error ? h('div', { style: s.error }, error) : null,
        h('div', { style: s.hint }, t('ladder explain')),
      )
    }

    function SupaSessionToggle(props) {
      const sessionId = String(props?.sessionId ?? props?.session?.id ?? '')
      const [state, setState] = useState(null)
      const [busy, setBusy] = useState(false)
      const [hover, setHover] = useState(false)

      useEffect(() => {
        let alive = true
        request('/supa/state').then((next) => {
          if (alive) setState(next)
        }).catch(() => {})
        return () => {
          alive = false
        }
      }, [])

      if (!sessionId || !state) return null
      const mode = state.config?.mode ?? 'session'
      // "all" means the plugin answers for every session, so the pill is a
      // read-only status there; only "session" mode makes it a switch.
      const enabled = mode === 'all'
        ? true
        : (state.supaSessions ?? []).some((id) => String(id) === sessionId)
      const locked = mode !== 'session'

      const toggle = async () => {
        if (locked || busy) return
        setBusy(true)
        try {
          setState(await request('/supa/action', { action: 'session', id: sessionId, enabled: !enabled }))
        } catch {
          // leave the pill as it was
        } finally {
          setBusy(false)
        }
      }

      return h('button', {
        type: 'button',
        onClick: toggle,
        disabled: locked || busy,
        onMouseEnter: () => setHover(true),
        onMouseLeave: () => setHover(false),
        title: locked
          ? `SupA answers in every session (mode: ${mode})`
          : enabled
            ? 'SupA is on in this session — click to turn it off'
            : 'SupA is off in this session — click to turn it on',
        // Matches the header's own utilities: no border, same height, quiet
        // text. The 6px dot is the only thing that carries the state.
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 26,
          padding: '0 8px',
          borderRadius: 8,
          border: '1px solid transparent',
          background: hover && !locked ? 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,.12))' : 'transparent',
          color: enabled ? 'var(--dsw-alias-label-primary, #1f2328)' : 'var(--dsw-alias-label-secondary, #6b7280)',
          fontSize: 12,
          fontWeight: 400,
          lineHeight: 1,
          cursor: locked ? 'default' : 'pointer',
          opacity: busy ? 0.6 : 1,
        },
      },
      h('span', {
        style: {
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: enabled ? 'var(--dsw-alias-state-success-primary, #2f855a)' : 'var(--dsw-alias-state-idle-primary, #9aa0aa)',
        },
      }),
      'SupA')
    }

    // Two whole languages: Chinese when the app runs in Chinese, English
    // otherwise. Keys are the English text, so a missing translation falls back
    // to English instead of showing a placeholder.
    const LOCALE = (() => {
      let value = ''
      try {
        value = String(document?.documentElement?.lang || '')
      } catch {
        value = ''
      }
      if (!value) {
        try {
          value = String(navigator?.language || '')
        } catch {
          value = ''
        }
      }
      return value.toLowerCase().startsWith('zh') ? 'zh' : 'en'
    })()

    const ZH = {
      'Model ladder': '模型阶梯',
      'Model usage': '模型使用统计',
      'Per tier': '每个档位',
      'Completion': '完成比例',
      'Call timeline': '调用时间线',
      'Recent calls': '最近调用',
      '1 hour': '1 小时',
      '1 day': '1 天',
      '7 days': '7 天',
      'All': '全部',
      'all time': '全部时间',
      'last 1 day': '最近 1 天',
      'last 7 days': '最近 7 天',
      'last 30 days': '最近 30 天',
      'last': '最近',
      'hours': '小时',
      'records': '条记录',
      'done': '完成',
      'failed': '失败',
      'loading usage…': '正在加载用量…',
      'per tier hint': '还没有调用记录。派一次任务之后这里就会有。',
      'timeline hint': '还没有已完成的调用。',
      'T1 is empty': 'T1 是空的',
      'T1 is empty hint': '没有 T1 就没有能接住最难任务的档位。此刻 SupA 无法启用，派活也会被拒绝；先在槽位 1 放一个模型。',
      'empty slot — drag a tier here': '空槽位 — 把模型拖到这里',
      'Reset': '重置',
      'Sure?': '确定？',
      'Refresh': '刷新',
      'Policy': '策略',
      'Session scope': '会话范围',
      'Approvals': '审批',
      'Authority ceiling': '权限上限',
      'Failure cooldown': '失败冷却',
      'Questions': '提问',
      'Fan-out': '并发',
      'Shell hand-off': '命令转交',
      'Codex model catalog': 'Codex 模型目录',
      'Harness routes (read live from the llm service)': 'Harness 路由（从 llm 服务实时读取）',
      'No catalog cached. Scan to read the model list.': '还没有缓存目录。点 Scan 读取模型列表。',
      'Failed routes': '失败的档位',
      'Add a tier': '添加档位',
      'Add': '添加',
      'Add a model manually': '手动添加模型',
      'This spends tokens': '这会消耗 token',
      'Off': '禁用',
      'Remove': '移除',
      'Apply': '应用',
      'Pin tiers': '验证档位',
      'Loading dsh-ladder-superagents…': '正在加载 dsh-ladder-superagents…',
      'Pin': '测试',
      'Scan': '扫描',
      'models': '个模型',
      'scanned': '扫描于',
      'verified usable': '个已验证可用',
      'verified only': '只看已验证',
      'scanned only': '仅扫描',
      'pin failed': '验证失败',
      'pinned usable': '已验证可用',
      'scanned, not pinned': '已扫描，未验证',
      'session (opt-in)': '会话（按需启用）',
      'sleeps and loops': '睡眠与轮询',
      'sleeps, builds, tests': '睡眠、构建、测试',
      'every shell command': '所有命令',
      'no default effort': '无默认 effort',
      'ask the user': '询问用户',
      'decide in-process': '进程内决定',
      'refused': '拒绝',
      'allowed': '允许',
      'usable': '可用',
      'tiers': '档位',
      'autoApprove': '自动批准',
      'authority': '权限',
      'default effort': '默认 effort',
      'nothing verified hint': '还没有验证过任何模型。取消勾选"只看已验证"，然后点某个模型旁的"测试"——一次真实调用就能证明它可用。',
      'saving hint': '保存会改写 profile 里的插件行，插件重启约一秒。',
      'which sessions hint': '哪些会话作为 SupA 运行；按需启用需要每个会话执行一次 `supa_session enable`',
      'hide unpinned hint': '隐藏未验证或验证失败的模型',
      'which shell calls go to a worker instead of this turn': '哪些命令转交给子代理，而不是在本轮执行',
      'how many children may run at once': '同时最多几个子代理',
      'how long a failed tier stays out of rotation': '失败后多久不再参与调度',
      'the most a root SupA holds without asking the human': 'SupA 不问人时的最高权限',
      'whether ask_user_question may pop the option dialog': '是否允许弹出选项对话框',
      'a request goes to the human through the approval prompt': '请求通过审批提示交给人类',
      'every session': '所有会话',
      'root sessions only': '仅根会话',
      'by preset': '按预设',
      'minutes': '分钟',
      'auto approve hint': '请求当场批准，并记入账本',
      'all slots taken': '十个槽位都占了——先移除一个再加。',
      'added to free slot': '已放入第一个空槽位，之后可以拖动调整位置。',
      'ladder explain': '阶梯共十个槽位：T1 最强，负责 10 分难度的任务；T10 最弱，负责 1 分难度。拖动左侧手柄可以改变槽位——槽位就是它的档位。',
    }
    const t = (english) => (LOCALE === 'zh' ? (ZH[english] ?? english) : english)

    const SEGMENTS = [
      ['1', t('1 hour')],
      ['24', t('1 day')],
      ['168', t('7 days')],
      ['0', t('All')],
    ]

    const segmentIdle = {
      padding: '4px 10px',
      borderRadius: 14,
      border: 'none',
      background: 'transparent',
      color: 'var(--dsw-alias-label-secondary, #6b7280)',
      fontSize: 12,
      cursor: 'pointer',
    }

    const segmentActive = {
      ...segmentIdle,
      background: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,.16))',
      color: 'var(--dsw-alias-label-primary, #1f2328)',
      fontWeight: 500,
    }

    function SupaStatsView() {
      const [stats, setStats] = useState(null)
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [hours, setHours] = useState('24')

      const load = useCallback(async () => {
        setBusy(true)
        try {
          setStats(await request(`/supa/stats?hours=${hours}`))
          setError('')
        } catch (failure) {
          setError(String(failure?.message ?? failure))
        } finally {
          setBusy(false)
        }
      }, [hours])

      useEffect(() => {
        load()
      }, [load])

      if (error) return h('div', { style: s.page }, h('div', { style: s.error }, `stats: ${error}`))
      if (!stats) return h('div', { style: s.page }, h('div', { style: s.hint }, t('loading usage…')))

      const summary = stats.summary ?? []
      const recent = stats.recent ?? []
      const totalDone = summary.reduce((sum, row) => sum + row.done, 0)
      const totalFailed = summary.reduce((sum, row) => sum + row.failed, 0)

      const windowLabel = (() => {
        const value = Number(hours)
        if (!Number.isFinite(value) || value <= 0) return t('all time')
        if (value === 24) return t('last 1 day')
        if (value === 168) return t('last 7 days')
        if (value === 720) return t('last 30 days')
        return `${t('last')} ${value} ${t('hours')}`
      })()

      const summaryRows = summary.map((row) => h('div', {
        key: row.route,
        style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap' },
      },
      h('span', { style: { fontSize: 12, minWidth: 34, color: color.text } }, `T${row.slot ?? '?'}`),
      h('span', { style: { ...s.meta, flex: 1, color: color.text } }, row.route),
      h('span', { style: s.meta }, `invoked ${row.started}`),
      h('span', { style: { ...s.meta, color: color.ok } }, `done ${row.done}`),
      h('span', { style: { ...s.meta, color: row.failed ? color.bad : color.muted } }, `failed ${row.failed}`),
      h('span', { style: s.meta }, `avg ${row.avgMs}ms`),
      h('span', { style: s.meta }, row.inputTokens || row.outputTokens
        ? `${row.inputTokens}/${row.outputTokens} tok`
        : '')))

      const recentRows = (records) => records.map((record, index) => h('div', {
        key: `${record.at}-${index}`,
        style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'nowrap', fontSize: 12 },
      },
      h('span', { style: { ...s.meta, minWidth: 150 } }, new Date(record.at).toLocaleString()),
      h('span', {
        style: { minWidth: 46, color: record.kind === 'failed' ? color.bad : record.kind === 'done' ? color.ok : color.muted },
      }, String(record.kind ?? '?')),
      h('span', { style: { ...s.meta, minWidth: 34 } }, `T${record.slot ?? '?'}`),
      h('span', { style: { ...s.meta, flex: 1, color: color.text } }, String(record.task ?? '').slice(0, 60)),
      h('span', { style: s.meta }, record.ms ? `${record.ms}ms` : '')))

      // A cheap visual: one proportion bar per tier, done vs failed.
      const barRows = summary.map((row) => {
        const total = Math.max(1, row.started)
        const donePct = Math.round((row.done / total) * 100)
        const failedPct = Math.round((row.failed / total) * 100)
        return h('div', {
          key: `bar-${row.route}`,
          style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' },
        },
        h('span', { style: { fontSize: 11, minWidth: 34, color: color.muted } }, `T${row.slot ?? '?'}`),
        h('div', {
          style: {
            flex: 1,
            height: 8,
            borderRadius: 4,
            overflow: 'hidden',
            display: 'flex',
            background: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,.12))',
          },
        },
        h('div', { style: { width: `${donePct}%`, height: '100%', background: 'var(--dsw-alias-state-success-primary, #2f855a)' } }),
        h('div', { style: { width: `${failedPct}%`, height: '100%', background: 'var(--dsw-alias-state-error-primary, #c53030)' } })),
        h('span', { style: { fontSize: 11, minWidth: 84, color: color.muted, textAlign: 'right' } }, `${row.done}/${total}`))
      })

      // One row per finished call, width normalised to the slowest call in the
      // window. Wall-clock position is deliberately dropped: a five-second call
      // next to a twenty-minute gap is invisible on a time axis.
      const finished = recent.filter((record) => Number(record.ms) > 0)
      const axisMs = Math.max(1, Number(stats.slowestMs) || 0)
      const laneRows = finished.slice(0, 20).map((record, index) => {
        const width = Math.max(1, (Number(record.ms) / axisMs) * 100)
        return h('div', {
          key: `lane-${record.at}-${index}`,
          style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' },
        },
        h('span', { style: { fontSize: 11, minWidth: 34, color: color.muted } }, `T${record.slot ?? '?'}`),
        h('div', {
          style: {
            flex: 1,
            height: 10,
            background: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,.08))',
            borderRadius: 3,
            overflow: 'hidden',
            // DevTools-style gridlines at quarter marks of the fixed axis.
            backgroundImage: 'repeating-linear-gradient(to right, rgba(127,127,127,.22) 0 1px, transparent 1px 25%)',
          },
        },
        h('div', {
          title: `${record.route ?? ''} · ${record.ms}ms`,
          style: {
            width: `${width}%`,
            height: '100%',
            borderRadius: 3,
            background: record.kind === 'failed'
              ? 'var(--dsw-alias-state-error-primary, #c53030)'
              : 'var(--dsw-alias-state-success-primary, #2f855a)',
          },
        })),
        h('span', { style: { fontSize: 11, minWidth: 60, color: color.muted, textAlign: 'right' } }, `${record.ms}ms`))
      })

      return h('div', { style: { ...s.page, gap: 10, padding: '16px 28px 20px' } },
        h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            paddingRight: 12,
          },
        },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
            h('div', { style: s.title }, t('Model usage')),
            h('div', { style: s.sub }, `${windowLabel} · ${stats.records} ${t('records')} · ${t('done')} ${totalDone} · ${t('failed')} ${totalFailed}`)),
          h('div', { style: s.actions },
            ...SEGMENTS.map(([value, label]) => h('button', {
              key: value,
              style: hours === value ? segmentActive : segmentIdle,
              disabled: busy,
              onClick: () => setHours(value),
            }, label)),
            h('button', { style: s.btn, onClick: load, disabled: busy }, t('Refresh')))),

        h('div', { style: s.card },
          h('div', { style: s.sectionTitle }, t('Per tier')),
          summary.length === 0
            ? h('div', { style: s.hint }, t('per tier hint'))
            : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } }, ...summaryRows)),

        h('div', { style: s.card },
          h('div', { style: s.sectionTitle }, t('Completion')),
          summary.length === 0
            ? h('div', { style: s.hint }, '—')
            : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } }, ...barRows)),

        h('div', { style: s.card },
          h('div', { style: s.sectionTitle }, t('Call timeline')),
          laneRows.length === 0
            ? h('div', { style: s.hint }, t('timeline hint'))
            : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: color.muted } },
                ...[0, 0.25, 0.5, 0.75, 1].map((fraction) => h('span', { key: fraction }, `${Math.round(axisMs * fraction)}ms`))),
              ...laneRows)),

        h('div', { style: s.card },
          h('div', { style: s.sectionTitle }, t('Recent calls')),
          recent.length === 0
            ? h('div', { style: s.hint }, '—')
            : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } }, ...recentRows(recent))))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'ladder-superagents',
          order: 25,
          label: LOCALE === 'zh' ? 'SupA 配置' : 'SupA settings',
        }, SupaSettings))

        // One control in the session header: the human switch for `mode: session`.
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities',
          id: 'ladder-superagents',
          order: 10,
          label: 'SupA',
        }, SupaSessionToggle))

        // The usage view beside 对话 / 轨迹 / 上下文 / 编队.
        ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view',
          id: 'supa-stats',
          order: 40,
          label: LOCALE === 'zh' ? '统计' : 'Stats',
        }, SupaStatsView))
      },
    }
  },
})






