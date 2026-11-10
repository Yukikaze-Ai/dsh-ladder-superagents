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
        h('span', { style: s.dot(tier.available && tier.enabled) }),
        h('span', null, tier.enabled ? (tier.available ? 'usable' : 'missing') : 'disabled')),
      h('div', { style: s.actions },
        h('button', { style: s.btnIcon, onClick: () => move(tier.slot - 1), disabled: tier.slot <= 1, title: 'Move up a tier' }, '↑'),
        h('button', { style: s.btnIcon, onClick: () => move(tier.slot + 1), disabled: tier.slot >= 10, title: 'Move down a tier' }, '↓'),
        h('button', { style: s.btn, onClick: toggle, title: tier.enabled ? 'Disable this tier' : 'Enable this tier' }, tier.enabled ? 'Off' : 'On'),
        h('button', {
          style: confirming ? { ...s.btn, color: color.bad } : s.btnIcon,
          onClick: () => {
            if (confirming) onAction({ action: 'remove', id: tier.id })
            else setConfirming(true)
          },
          title: confirming ? 'Click again to remove this tier' : 'Remove this tier',
        }, confirming ? 'Sure?' : '✕')))
    }

    function Catalog({ catalog, llm, busy, onScan, onPin }) {
      const scanned = catalog?.at ? new Date(catalog.at).toLocaleTimeString() : ''
      const verdictOf = (slug, effort) => catalog?.probes?.[`${slug}@${effort}`]
      return h('div', { style: s.card },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } },
          h('div', { style: s.sectionTitle }, 'Codex model catalog'),
          h('div', { style: s.actions },
            h('button', { style: s.btn, onClick: () => onScan({ action: 'scan' }), disabled: busy }, 'Scan'),
            h('button', { style: s.btn, onClick: () => onPin({ action: 'pin' }), disabled: busy }, 'Pin tiers'))),
        h('div', { style: s.warn },
          'Scan reads the catalog only. Pinning — tiers or one model — sends one real call per model+effort configuration, so it consumes that model\'s tokens/usage.'),
        catalog
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
            h('div', { style: s.hint }, `${catalog.models.length} models · scanned ${scanned}`),
            ...catalog.models.map((model) => h('div', {
              key: model.slug,
              style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap' },
            },
            h('span', { style: { fontSize: 12, minWidth: 150, color: color.text } }, model.slug),
            h('span', { style: s.chip }, model.visibility || '?'),
            h('span', { style: { ...s.meta, flex: 1 } },
              model.efforts.map((effort) => {
                const verdict = verdictOf(model.slug, effort)
                return `${effort}${verdict ? (verdict.ok ? ' ✓' : ' ✕') : ''}`
              }).join('  ') || 'no efforts'),
            h('button', {
              style: s.btn,
              onClick: () => onPin({ action: 'pin', model: model.slug }),
              disabled: busy,
              title: `Test every effort of ${model.slug} with a real call`,
            }, 'Pin'))))
          : h('div', { style: s.hint }, 'No catalog cached. Scan to read the model list.'),
        llm?.length
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 6 } },
            h('div', { style: s.hint }, 'Harness routes (read live from the llm service)'),
            ...llm.map((route) => h('div', {
              key: `${route.provider}/${route.model}`,
              style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'nowrap' },
            },
            h('span', { style: { fontSize: 12, minWidth: 210, color: color.text } }, `${route.provider}/${route.model}`),
            h('span', { style: s.chip }, route.defaultEffort ? `default ${route.defaultEffort}` : 'no default'),
            h('span', { style: { ...s.meta, flex: 1 } }, route.efforts.length ? route.efforts.join('  ') : 'no reasoning metadata'))))
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
          ? 'The ladder already holds 10 tiers — remove one to add another.'
          : 'Added at the weakest end; drag it into place afterwards.'),
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

    function SupaSettings() {
      const [state, setState] = useState(null)
      const [cwd, setCwd] = useState('')
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [dragIndex, setDragIndex] = useState(null)

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
          h('button', { style: s.btn, onClick: () => load(cwd), disabled: busy }, 'Refresh')),

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

        state.failures?.length
          ? h('div', { style: s.card },
            h('div', { style: s.sectionTitle }, 'Failed configurations'),
            h('div', { style: s.hint }, 'A failed tier leaves rotation automatically. Restore clears the mark and puts it back.'),
            ...state.failures.map((failure) => h('div', {
              key: failure.id,
              style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap' },
            },
            h('span', { style: { color: color.bad, fontSize: 12 } }, '✕'),
            h('span', { style: { fontSize: 12, minWidth: 150, color: color.text } }, failure.label),
            h('span', { style: { ...s.meta, flex: 1 } }, `${failure.route} · ${String(failure.error).slice(0, 140)}`),
            h('button', { style: s.btn, onClick: () => act({ action: 'clear', id: failure.id }) }, 'Restore'))))
          : null,

        h(Catalog, { catalog: state.catalog, llm: state.llm, busy, onScan: act, onPin: act }),
        h(AddForm, { drivers: state.drivers, onAdd: act, disabled: tiers.length >= 10 }),

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
