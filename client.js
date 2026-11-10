window.__ModuleLoader__.load({
  id: 'dsh-supa',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useState } = React

    const border = '1px solid var(--dsw-alias-border, rgba(128, 128, 128, 0.28))'
    const muted = 'var(--dsw-alias-text-2, rgba(128, 128, 128, 0.95))'
    const text = 'var(--dsw-alias-text-1, inherit)'

    const styles = {
      page: { display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0', color: text },
      head: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
      title: { fontSize: 15, fontWeight: 600 },
      hint: { fontSize: 12, color: muted, wordBreak: 'break-all' },
      warn: { fontSize: 12, color: 'var(--dsw-alias-state-warn, #b7791f)' },
      table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
      th: { textAlign: 'left', padding: '6px 8px', borderBottom: border, color: muted, fontWeight: 500, fontSize: 12 },
      td: { padding: '6px 8px', borderBottom: border, verticalAlign: 'middle' },
      button: {
        fontSize: 12,
        lineHeight: '20px',
        padding: '0 8px',
        borderRadius: 6,
        border,
        background: 'transparent',
        color: text,
        cursor: 'pointer',
      },
      input: {
        fontSize: 12,
        lineHeight: '20px',
        padding: '0 6px',
        borderRadius: 6,
        border,
        background: 'transparent',
        color: text,
        minWidth: 0,
      },
      row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
      dot: (on) => ({
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: on ? 'var(--dsw-alias-state-ok, #35a854)' : 'var(--dsw-alias-state-error, #c04040)',
      }),
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

    function Cell(props) {
      return h('td', { style: styles.td }, props.children)
    }

    function TierRow({ tier, index, count, onAction }) {
      const toggle = () => onAction({ action: 'enable', id: tier.id, enabled: !tier.enabled })
      const move = (to) => onAction({ action: 'move', id: tier.id, to })
      return h('tr', null,
        h(Cell, null, h('span', { style: { color: muted } }, String(index + 1))),
        h(Cell, null,
          h('div', { style: { fontWeight: 500 } }, tier.label),
          h('div', { style: { fontSize: 11, color: muted } },
            `${tier.route} · ceiling ${tier.ceiling} · ${tier.id}`)),
        h(Cell, null,
          h('span', { style: styles.dot(tier.available && tier.enabled && !tier.failure) }),
          h('span', { style: { marginLeft: 6, fontSize: 12, color: tier.failure ? 'var(--dsw-alias-state-error, #c04040)' : muted } },
            tier.failure
              ? `failed: ${String(tier.failure.error || '').slice(0, 70)}`
              : tier.enabled ? (tier.available ? 'usable' : 'missing binary') : 'disabled')),
        h(Cell, null,
          h('div', { style: styles.row },
            h('button', { style: styles.button, onClick: () => move(index - 1), disabled: index === 0, title: 'Move up' }, '↑'),
            h('button', { style: styles.button, onClick: () => move(index + 1), disabled: index === count - 1, title: 'Move down' }, '↓'),
            h('button', { style: styles.button, onClick: toggle }, tier.enabled ? 'Disable' : 'Enable'),
            tier.failure
              ? h('button', { style: styles.button, onClick: () => onAction({ action: 'clear', id: tier.id }) }, 'Clear')
              : null,
            h('button', { style: styles.button, onClick: () => onAction({ action: 'remove', id: tier.id }) }, 'Remove'))))
    }

    function AddForm({ drivers, onAdd }) {
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

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 } },
        h('div', { style: { fontSize: 12, color: muted } }, 'Add a tier at the weakest end'),
        h('div', { style: styles.row },
          h('select', { style: styles.input, value: kind, onChange: (event) => setKind(event.target.value) },
            h('option', { value: 'llm' }, 'llm'),
            h('option', { value: 'cli' }, 'cli')),
          kind === 'cli'
            ? h('select', { style: styles.input, value: driver, onChange: (event) => setDriver(event.target.value) },
              ...drivers.map((name) => h('option', { key: name, value: name }, name)))
            : h('input', { style: styles.input, placeholder: 'provider', value: provider, onChange: (event) => setProvider(event.target.value) }),
          h('input', { style: styles.input, placeholder: 'model', value: model, onChange: (event) => setModel(event.target.value) }),
          h('input', { style: styles.input, placeholder: 'effort', value: effort, onChange: (event) => setEffort(event.target.value) }),
          h('input', { style: { ...styles.input, width: 64 }, placeholder: 'ceiling', value: ceiling, onChange: (event) => setCeiling(event.target.value) }),
          h('input', { style: { ...styles.input, flex: 1, minWidth: 160 }, placeholder: 'label', value: label, onChange: (event) => setLabel(event.target.value) }),
          h('button', { style: styles.button, onClick: submit }, 'Add')),
        error ? h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-state-error, #c04040)' } }, error) : null)
    }

    function Catalog({ catalog, busy, onScan, onPin }) {
      const scanned = catalog?.at ? new Date(catalog.at).toLocaleTimeString() : ''
      const verdictOf = (slug, effort) => catalog?.probes?.[`${slug}@${effort}`]
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 } },
        h('div', { style: { fontSize: 13, fontWeight: 600 } }, 'Codex model catalog'),
        h('div', { style: styles.row },
          h('button', { style: styles.button, onClick: () => onScan({ action: 'scan' }), disabled: busy }, 'Scan'),
          h('button', { style: styles.button, onClick: () => onPin({ action: 'pin' }), disabled: busy }, 'Pin tiers'),
          h('span', { style: styles.warn },
            'Scan reads the catalog only. Pinning — tiers or one model — sends one real call per model+effort configuration, so it consumes that model\'s tokens/usage.')),
        catalog
          ? h('div', { style: { fontSize: 12, color: muted, display: 'flex', flexDirection: 'column', gap: 4 } },
            h('div', null, `${catalog.models.length} models · scanned ${scanned}`),
            ...catalog.models.map((model) => h('div', {
              key: model.slug,
              style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
            },
            h('span', { style: { minWidth: 150 } }, `${model.slug} · ${model.visibility || '?'}`),
            h('span', { style: { color: muted } },
              model.efforts.map((effort) => {
                const verdict = verdictOf(model.slug, effort)
                const mark = verdict ? (verdict.ok ? ' ✓' : ' ✕') : ''
                return `${effort}${mark}`
              }).join('  ') || 'no efforts'),
            h('button', {
              style: styles.button,
              onClick: () => onPin({ action: 'pin', model: model.slug }),
              disabled: busy,
              title: `Test every effort of ${model.slug} with a real call`,
            }, 'Pin'))))
          : h('div', { style: { fontSize: 12, color: muted } }, 'No catalog cached. Scan to read the model list.'),
      )
    }

    function SupaSettings() {
      const [state, setState] = useState(null)
      const [cwd, setCwd] = useState('')
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)

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
        try {
          load(localStorage.getItem('dsh-supa.cwd') || undefined)
        } catch {
          load()
        }
      }, [load])

      const act = useCallback(async (body) => {
        setBusy(true)
        try {
          const data = await request('/supa/action', { ...body, cwd })
          setState(data)
          setError('')
        } catch (failure) {
          setError(String(failure.message ?? failure))
        } finally {
          setBusy(false)
        }
      }, [cwd])

      const tiers = state?.tiers ?? []
      const summary = useMemo(() => {
        if (!state) return ''
        const usable = tiers.filter((tier) => tier.available && tier.enabled).length
        return `${usable}/${tiers.length} usable · autoApprove ${String(state.config.autoApprove)} · authority ${state.config.authority}`
      }, [state, tiers])

      if (error && !state) {
        return h('div', { style: styles.page }, h('div', { style: { fontSize: 13 } }, `dsh-supa: ${error}`))
      }
      if (!state) {
        return h('div', { style: styles.page }, h('div', { style: { fontSize: 13, color: muted } }, 'Loading dsh-supa…'))
      }

      return h('div', { style: styles.page },
        h('div', { style: styles.head },
          h('div', null,
            h('div', { style: styles.title }, 'Model ladder'),
            h('div', { style: styles.hint }, `${summary} · ${state.file}`)),
          h('button', { style: styles.button, onClick: () => load(cwd), disabled: busy }, 'Refresh')),
        state.workspaces.length > 1
          ? h('select', {
            style: { ...styles.input, maxWidth: 420 },
            value: cwd,
            onChange: (event) => {
              try {
                localStorage.setItem('dsh-supa.cwd', event.target.value)
              } catch {
                // storage unavailable: the choice still applies to this render
              }
              load(event.target.value)
            },
          }, ...state.workspaces.map((workspace) => h('option', { key: workspace.id, value: workspace.path }, `${workspace.title} — ${workspace.path}`)))
          : null,
        tiers.length === 0
          ? h('div', { style: { fontSize: 13, color: muted } }, 'The ladder is empty: every child inherits the parent route.')
          : h('table', { style: styles.table },
            h('thead', null,
              h('tr', null,
                h('th', { style: styles.th }, '#'),
                h('th', { style: styles.th }, 'Tier'),
                h('th', { style: styles.th }, 'State'),
                h('th', { style: styles.th }, 'Actions'))),
            h('tbody', null,
              ...tiers.map((tier, index) => h(TierRow, {
                key: tier.id,
                tier,
                index,
                count: tiers.length,
                onAction: act,
              })))),
        h(Catalog, { catalog: state.catalog, busy, onScan: act, onPin: act }),
        h(AddForm, { drivers: state.drivers, onAdd: act }),
        error ? h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-state-error, #c04040)' } }, error) : null,
        h('div', { style: styles.hint },
          'Order is capability: position 1 is the strongest. A task scored 1–10 takes the weakest tier whose ceiling still covers it.'),
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
