window.__ModuleLoader__.load({
  id: 'dsh-supa',
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
      warn: { fontSize: 12, color: color.warn, lineHeight: '18px' },
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
        h('button', { style: s.btn, onClick: toggle, title: tier.enabled ? 'Disable this tier' : 'Enable this tier' }, tier.enabled ? 'Off' : 'On'),
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
        }, confirming ? 'Sure?' : '✕')))
    }

    function Catalog({ catalog, llm, failures, busy, onScan, onPin, onAdd, canPinTiers }) {
      const [pending, setPending] = useState('')
      const [adding, setAdding] = useState('')
      const [verifiedOnly, setVerifiedOnly] = useState(false)
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
          h('div', { style: s.sectionTitle }, 'Codex model catalog'),
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
            'verified only'),
            h('button', {
              style: s.btn,
              onClick: () => run('scan', { action: 'scan' }),
              disabled: busyNow,
              title: 'Read the model catalog from the CLI. Free: no request is sent to any model.',
            }, 'Scan'),
            h('button', {
              style: canPinTiers ? s.btn : { ...s.btn, opacity: 0.4 },
              onClick: () => run('pin-tiers', { action: 'pin' }),
              disabled: busyNow || !canPinTiers,
              title: canPinTiers
                ? 'Verify the codex tiers in the ladder: one real call per configuration, so it consumes that model\'s tokens'
                : 'The ladder has no CLI tier to pin — pin a catalog model instead',
            }, 'Pin tiers'))),
        pending
          ? h('div', {
            style: { fontSize: 12, color: color.muted, animation: 'supaPulse 1.2s ease-in-out infinite', padding: '8px 0' },
          }, pendingText)
          : catalog
            ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
              h('div', { style: s.hint },
                `${catalog.models.length} models · scanned ${scanned} · `
                + `${allModels.filter(verified).length} verified usable`),
              h('div', { style: { display: 'flex', gap: 14, alignItems: 'center', fontSize: 11, color: color.muted } },
                h('span', { style: { display: 'flex', gap: 5, alignItems: 'center' } }, h('span', { style: s.dot(true) }), 'pinned usable'),
                h('span', { style: { display: 'flex', gap: 5, alignItems: 'center' } }, h('span', { style: { ...s.dot(true), background: color.warn } }), 'scanned only'),
                h('span', { style: { display: 'flex', gap: 5, alignItems: 'center' } }, h('span', { style: s.dot(false) }), 'pin failed')),
              shownModels.length === 0
                ? h('div', { style: s.hint }, verifiedOnly
                  ? 'Nothing verified yet. Uncheck "verified only", then press Pin on a model — one real call proves it.'
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
                    ? { color: color.ok, label: 'pinned usable' }
                    : { color: color.warn, label: 'scanned, not pinned' }
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
                      onClick: () => run(`pin:${model.slug}`, { action: 'pin', model: model.slug }),
                      disabled: busyNow,
                      title: `Test every effort of ${model.slug} with a real call`,
                    }, 'Pin'),
                    h('button', {
                      style: s.btn,
                      onClick: () => setAdding(adding === model.slug ? '' : model.slug),
                      disabled: busyNow,
                      title: 'Add this model to the first free slot',
                    }, 'Add')),
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
            : h('div', { style: s.hint }, 'No catalog cached. Scan to read the model list.'),
        llm?.length
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 6 } },
            h('div', { style: s.hint }, 'Harness routes (read live from the llm service)'),
            ...llm.map((route) => h('div', {
              key: `${route.provider}/${route.model}`,
              style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'nowrap' },
            },
            h('span', { style: { fontSize: 12, minWidth: 210, color: color.text } }, `${route.provider}/${route.model}`),
            h('span', { style: s.chip }, route.defaultEffort ? `default effort ${route.defaultEffort}` : 'no default effort'),
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
            }, 'Add'))))
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
        h('div', { style: s.sectionTitle }, 'Add a tier'),
        h('div', { style: s.hint }, disabled
          ? 'All ten slots are taken — remove one to add another.'
          : 'Added to the first free slot; drag it into place afterwards.'),
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
          h('button', { style: disabled ? { ...s.btnPrimary, opacity: 0.4 } : s.btnPrimary, onClick: submit, disabled }, 'Add')),
        error ? h('div', { style: s.error }, error) : null)
    }

    function Policy({ config, busy, onConfig }) {
      const [minutes, setMinutes] = useState('')
      useEffect(() => {
        setMinutes(String(Math.round((config?.failureCooldownMs ?? 0) / 60000)))
      }, [config?.failureCooldownMs])

      return h('div', { style: s.card },
        h('div', { style: s.sectionTitle }, 'Policy'),
        h('div', { style: s.hint }, 'Saving writes this plugin row in the profile config, which restarts it for about a second.'),
        h('div', { style: s.row },
          h('span', { style: { fontSize: 12, minWidth: 150 } }, 'Approvals'),
          h('button', {
            style: s.btn,
            disabled: busy,
            onClick: () => onConfig({ autoApprove: !config.autoApprove }),
          }, config.autoApprove ? 'decide in-process' : 'ask the user'),
          h('span', { style: { ...s.meta, flex: 1 } }, config.autoApprove
            ? 'a request is granted once and audited in the ledger'
            : 'a request goes to the human through the approval prompt')),
        h('div', { style: s.row },
          h('span', { style: { fontSize: 12, minWidth: 150 } }, 'Authority ceiling'),
          h('select', {
            style: s.input,
            value: config.authority,
            disabled: busy,
            onChange: (event) => onConfig({ authority: event.target.value }),
          },
          h('option', { value: 'workspace' }, 'workspace'),
          h('option', { value: 'full' }, 'full')),
          h('span', { style: { ...s.meta, flex: 1 } }, 'the most a root SupA holds without asking the human')),
        h('div', { style: s.row },
          h('span', { style: { fontSize: 12, minWidth: 150 } }, 'Failure cooldown'),
          h('input', {
            style: { ...s.input, width: 80 },
            value: minutes,
            placeholder: 'minutes',
            onChange: (event) => setMinutes(event.target.value),
          }),
          h('button', {
            style: s.btn,
            disabled: busy,
            onClick: () => onConfig({ failureCooldownMinutes: Number(minutes) || 0 }),
          }, 'Apply'),
          h('span', { style: { ...s.meta, flex: 1 } }, 'how long a failed tier stays out of rotation')),
        h('div', { style: s.row },
          h('span', { style: { fontSize: 12, minWidth: 150 } }, 'Questions'),
          h('button', {
            style: s.btn,
            disabled: busy,
            onClick: () => onConfig({ denyBlockingQuestions: !config.denyBlockingQuestions }),
          }, config.denyBlockingQuestions ? 'refused' : 'allowed'),
          h('span', { style: { ...s.meta, flex: 1 } }, 'whether ask_user_question may pop the option dialog')),
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
        return `${usable}/${tiers.length} usable · ${tiers.length}/10 tiers · autoApprove ${String(state.config.autoApprove)} · authority ${state.config.authority}`
      }, [state, tiers])

      if (error && !state) {
        return h('div', { style: s.page }, h('div', { style: s.error }, `dsh-supa: ${error}`))
      }
      if (!state) {
        return h('div', { style: s.page }, h('div', { style: s.hint }, 'Loading dsh-supa…'))
      }

      return h('div', { style: s.page },
        h('div', { style: s.head },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
            h('div', { style: s.title }, 'Model ladder'),
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
            }, resetting ? 'Sure?' : 'Reset'),
            h('button', { style: s.btn, onClick: () => load(cwd), disabled: busy }, 'Refresh'))),

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
              h('div', { style: s.body }, h('div', { style: s.meta }, 'empty slot — drag a tier here')))
          })),

        h(Policy, { config: state.config, busy, onConfig: configure }),

        state.failures?.length
          ? h('div', { style: s.card },
            h('div', { style: s.sectionTitle }, 'Failed routes'),
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
          }, 'Add a model manually'),

        error ? h('div', { style: s.error }, error) : null,
        h('div', { style: s.hint },
          'The ladder is ten slots: T1 is the strongest and covers a 10-point task, T10 the weakest and covers a 1-point task. Drag a tier by its handle to change its slot; the slot is its tier.'),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'supa',
          order: 25,
          label: 'dsh-supa',
        }, SupaSettings))
      },
    }
  },
})
