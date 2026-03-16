import { useState, useCallback, useRef, useMemo, type DragEvent, type CSSProperties } from 'react';
import ReactECharts from 'echarts-for-react';

// ─── Field definitions ───────────────────────────────────────────────
const FIELD_LIST = [
  { id: 'yield', label: 'Yield', type: 'number' as const },
  { id: 'thickness', label: 'Thickness', type: 'number' as const },
  { id: 'cd', label: 'CD', type: 'number' as const },
  { id: 'overlay_x', label: 'Overlay_X', type: 'number' as const },
  { id: 'overlay_y', label: 'Overlay_Y', type: 'number' as const },
  { id: 'defect_count', label: 'Defect_Count', type: 'number' as const },
  { id: 'temperature', label: 'Temperature', type: 'number' as const },
  { id: 'pressure', label: 'Pressure', type: 'number' as const },
  { id: 'chamber_id', label: 'Chamber_ID', type: 'category' as const },
  { id: 'lot_id', label: 'Lot_ID', type: 'category' as const },
  { id: 'wafer_id', label: 'Wafer_ID', type: 'category' as const },
];

// Field type icon
const fieldIcon = (id: string) => {
  const f = FIELD_LIST.find(x => x.id === id);
  if (!f) return null;
  // # for numeric, Abc for category
  return f.type === 'number'
    ? <span style={{ fontSize: 10, fontWeight: 700, color: '#6b9f3a', background: '#eef6e4', borderRadius: 3, padding: '1px 4px', marginRight: 6, fontFamily: 'monospace', lineHeight: 1 }}>#</span>
    : <span style={{ fontSize: 10, fontWeight: 600, color: '#b07d2e', background: '#fdf4e3', borderRadius: 3, padding: '1px 3px', marginRight: 6, fontFamily: 'sans-serif', lineHeight: 1 }}>Abc</span>;
};

type ChartType = 'Bar' | 'Line' | 'Box' | 'Scatter';
type ZoneId = 'x_axis' | 'left_y_axis' | 'right_y_axis' | 'columns_by';

interface ZoneDef {
  id: ZoneId;
  label: string;
}

const DROP_ZONES: ZoneDef[] = [
  { id: 'x_axis', label: 'X Axis' },
  { id: 'left_y_axis', label: 'Left Y Axis' },
  { id: 'right_y_axis', label: 'Right Y Axis' },
  { id: 'columns_by', label: 'Columns by' },
];

// ─── Mock data (semiconductor manufacturing) ─────────────────────────
function generateMockData() {
  const chambers = ['A1', 'A2', 'B1', 'B2'];
  const lots = ['LOT001', 'LOT002', 'LOT003', 'LOT004', 'LOT005'];
  const wafers = Array.from({ length: 25 }, (_, i) => `W${String(i + 1).padStart(2, '0')}`);
  const rows: Record<string, string | number>[] = [];
  for (let i = 0; i < 30; i++) {
    rows.push({
      yield: +(85 + Math.random() * 14).toFixed(2),
      thickness: +(1000 + Math.random() * 200).toFixed(1),
      cd: +(28 + Math.random() * 4).toFixed(2),
      overlay_x: +(-5 + Math.random() * 10).toFixed(2),
      overlay_y: +(-5 + Math.random() * 10).toFixed(2),
      defect_count: Math.floor(Math.random() * 50),
      temperature: +(350 + Math.random() * 100).toFixed(1),
      pressure: +(1 + Math.random() * 4).toFixed(2),
      chamber_id: chambers[i % chambers.length],
      lot_id: lots[i % lots.length],
      wafer_id: wafers[i % wafers.length],
    });
  }
  return rows;
}

const MOCK_DATA = generateMockData();

// ─── Helpers ─────────────────────────────────────────────────────────
const fieldLabel = (id: string) => FIELD_LIST.find(f => f.id === id)?.label ?? id;

// ─── Build ECharts options ───────────────────────────────────────────
function buildChartOption(
  chartType: ChartType,
  xFields: string[],
  leftYFields: string[],
  rightYFields: string[],
): Record<string, unknown> | null {
  if (xFields.length === 0 && leftYFields.length === 0 && rightYFields.length === 0) return null;

  const allYFields = [...leftYFields, ...rightYFields];
  const hasX = xFields.length > 0;
  const hasY = allYFields.length > 0;

  // Build composite X key from all X fields (e.g. "W01 | A1")
  const xCompositeKey = (row: Record<string, string | number>) =>
    xFields.map(f => String(row[f])).join(' | ');
  const xLabel = xFields.map(fieldLabel).join(' | ');
  const xValues = hasX ? MOCK_DATA.map(r => xCompositeKey(r)) : [];
  const uniqueX = [...new Set(xValues)];

  const tooltip: Record<string, unknown> = { trigger: 'axis', confine: true };
  const legend: Record<string, unknown> = { show: false };
  const grid: Record<string, unknown> = { left: 70, right: rightYFields.length > 0 ? 70 : 35, top: 20, bottom: xFields.length > 1 ? 70 : 55, containLabel: false };

  // ─ X-only: show axis with ticks, no series ─
  if (hasX && !hasY) {
    return {
      tooltip, grid,
      xAxis: {
        type: 'category',
        name: xLabel,
        data: uniqueX,
        nameLocation: 'middle',
        nameGap: xFields.length > 1 ? 50 : 32,
        axisLabel: { rotate: uniqueX.length > 15 ? 45 : 0, fontSize: 11 },
        axisLine: { show: true },
        axisTick: { show: true },
      },
      yAxis: { type: 'value', show: true, axisLine: { show: true }, axisTick: { show: true }, splitLine: { show: true, lineStyle: { type: 'dashed', color: '#eee' } } },
      series: [],
    };
  }

  // ─ Y-only: show axis with ticks, no series ─
  if (!hasX && hasY) {
    // Compute min/max from data for proper tick range
    const yAxes = [];
    if (leftYFields.length > 0) {
      const allVals = leftYFields.flatMap(yf => MOCK_DATA.map(r => Number(r[yf])));
      yAxes.push({
        type: 'value',
        name: leftYFields.map(fieldLabel).join(', '),
        nameLocation: 'middle' as const,
        nameGap: 50,
        min: Math.floor(Math.min(...allVals) * 0.95),
        max: Math.ceil(Math.max(...allVals) * 1.05),
        axisLine: { show: true },
        axisTick: { show: true },
      });
    }
    if (rightYFields.length > 0) {
      const allVals = rightYFields.flatMap(yf => MOCK_DATA.map(r => Number(r[yf])));
      yAxes.push({
        type: 'value',
        name: rightYFields.map(fieldLabel).join(', '),
        nameLocation: 'middle' as const,
        nameGap: 50,
        min: Math.floor(Math.min(...allVals) * 0.95),
        max: Math.ceil(Math.max(...allVals) * 1.05),
        axisLine: { show: true },
        axisTick: { show: true },
      });
    }
    return {
      tooltip, grid,
      xAxis: { type: 'category', show: true, data: [], axisLine: { show: true }, axisTick: { show: false } },
      yAxis: yAxes.length > 0 ? yAxes : { type: 'value', show: true },
      series: [],
    };
  }

  // ─ Both X and Y assigned ─

  // ─ Scatter ─
  if (chartType === 'Scatter') {
    tooltip.trigger = 'item';
    const series = allYFields.map((yf) => ({
      name: fieldLabel(yf),
      type: 'scatter' as const,
      yAxisIndex: leftYFields.includes(yf) ? 0 : 1,
      data: MOCK_DATA.map(r => [xCompositeKey(r), r[yf]]),
      symbolSize: 8,
      itemStyle: { opacity: 0.75 },
    }));
    return {
      tooltip, legend, grid,
      xAxis: { type: 'category', name: xLabel, data: uniqueX, nameLocation: 'middle', nameGap: xFields.length > 1 ? 50 : 32, axisLabel: { rotate: uniqueX.length > 15 ? 45 : 0, fontSize: 11 } },
      yAxis: [
        { type: 'value', name: leftYFields.map(fieldLabel).join(', '), nameLocation: 'middle', nameGap: 50 },
        ...(rightYFields.length > 0
          ? [{ type: 'value', name: rightYFields.map(fieldLabel).join(', '), nameLocation: 'middle', nameGap: 50 }]
          : []),
      ],
      series,
    };
  }

  // ─ Box ─
  if (chartType === 'Box') {
    const grouped: Record<string, number[][]> = {};
    for (const yf of allYFields) {
      grouped[yf] = [];
      for (const cat of uniqueX) {
        const vals = MOCK_DATA.filter(r => xCompositeKey(r) === cat).map(r => Number(r[yf])).sort((a, b) => a - b);
        if (vals.length === 0) { grouped[yf].push([0, 0, 0, 0, 0]); continue; }
        const q1 = vals[Math.floor(vals.length * 0.25)];
        const q3 = vals[Math.floor(vals.length * 0.75)];
        const med = vals[Math.floor(vals.length * 0.5)];
        grouped[yf].push([vals[0], q1, med, q3, vals[vals.length - 1]]);
      }
    }
    const series = allYFields.map((yf) => ({
      name: fieldLabel(yf),
      type: 'boxplot' as const,
      yAxisIndex: leftYFields.includes(yf) ? 0 : 1,
      data: grouped[yf],
    }));
    return {
      tooltip: { trigger: 'item', confine: true }, legend, grid,
      xAxis: { type: 'category', data: uniqueX, name: xLabel, nameLocation: 'middle', nameGap: xFields.length > 1 ? 50 : 32, axisLabel: { rotate: uniqueX.length > 15 ? 45 : 0, fontSize: 11 } },
      yAxis: [
        { type: 'value', name: leftYFields.map(fieldLabel).join(', '), nameLocation: 'middle', nameGap: 50 },
        ...(rightYFields.length > 0
          ? [{ type: 'value', name: rightYFields.map(fieldLabel).join(', '), nameLocation: 'middle', nameGap: 50 }]
          : []),
      ],
      series,
    };
  }

  // ─ Bar / Line ─
  const aggregated: Record<string, Record<string, number[]>> = {};
  for (const yf of allYFields) {
    aggregated[yf] = {};
    for (const cat of uniqueX) aggregated[yf][cat] = [];
    for (const r of MOCK_DATA) aggregated[yf][xCompositeKey(r)].push(Number(r[yf]));
  }
  const series = allYFields.map((yf) => ({
    name: fieldLabel(yf),
    type: chartType.toLowerCase() as 'bar' | 'line',
    yAxisIndex: leftYFields.includes(yf) ? 0 : 1,
    data: uniqueX.map(cat => {
      const arr = aggregated[yf][cat];
      return arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : 0;
    }),
    ...(chartType === 'Bar' ? { barMaxWidth: 40 } : {}),
  }));
  return {
    tooltip, legend, grid,
    xAxis: { type: 'category', data: uniqueX, name: xLabel, nameLocation: 'middle', nameGap: xFields.length > 1 ? 50 : 32, axisLabel: { rotate: uniqueX.length > 15 ? 45 : 0, fontSize: 11 } },
    yAxis: [
      { type: 'value', name: leftYFields.map(fieldLabel).join(', '), nameLocation: 'middle', nameGap: 50 },
      ...(rightYFields.length > 0
        ? [{ type: 'value', name: rightYFields.map(fieldLabel).join(', '), nameLocation: 'middle', nameGap: 50 }]
        : []),
    ],
    series,
  };
}

// ─── Styles ──────────────────────────────────────────────────────────
const C = {
  bg: '#f5f6f8',
  card: '#ffffff',
  border: '#e2e5ea',
  accent: '#4c7cf3',
  accentLight: '#e8eeff',
  hotzone: 'rgba(76,124,243,0.08)',
  hotzoneActive: 'rgba(76,124,243,0.22)',
  hotzoneBorder: '#4c7cf3',
  tag: '#eef1f6',
  text: '#333',
  textSec: '#999',
};

// ═════════════════════════════════════════════════════════════════════
//  Component
// ═════════════════════════════════════════════════════════════════════
export default function ChartDialog({ open }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [chartType, setChartType] = useState<ChartType>('Scatter');
  const [autoApply, setAutoApply] = useState(true);
  const [dragOverZone, setDragOverZone] = useState<string | null>(null);
  const [showHotZones, setShowHotZones] = useState(false);
  const [dropIndicator, setDropIndicator] = useState<{ zone: ZoneId; index: number } | null>(null);
  const [editMode, setEditMode] = useState(false);

  const [zoneFields, setZoneFields] = useState<Record<ZoneId, string[]>>({
    x_axis: [], left_y_axis: [], right_y_axis: [], columns_by: [],
  });
  const [pendingZoneFields, setPendingZoneFields] = useState<Record<ZoneId, string[]> | null>(null);

  const displayZoneFields = pendingZoneFields ?? zoneFields;

  const usedFieldIds = useMemo(() => new Set(Object.values(displayZoneFields).flat()), [displayZoneFields]);

  const chartOption = useMemo(
    () => buildChartOption(chartType, zoneFields.x_axis, zoneFields.left_y_axis, zoneFields.right_y_axis),
    [chartType, zoneFields],
  );

  const dragFieldRef = useRef<string | null>(null);
  const dragSourceRef = useRef<{ zone: ZoneId; index: number } | 'column-list' | null>(null);

  // ── drag handlers ──────────────────────────────────────────────────
  const dragGhostRef = useRef<HTMLElement | null>(null);

  const onDragStart = useCallback((e: DragEvent, fieldId: string, source: { zone: ZoneId; index: number } | 'column-list') => {
    dragFieldRef.current = fieldId;
    dragSourceRef.current = source;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', fieldId);

    // Create a 30%-opacity ghost placed at cursor top-left
    const el = e.currentTarget as HTMLElement;
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.style.opacity = '0.3';
    ghost.style.position = 'fixed';
    ghost.style.top = '-9999px';
    ghost.style.left = '-9999px';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '99999';
    document.body.appendChild(ghost);
    // Place ghost to upper-left of cursor
    const rect = el.getBoundingClientRect();
    e.dataTransfer.setDragImage(ghost, rect.width + 8, rect.height + 8);
    dragGhostRef.current = ghost;

    setShowHotZones(true);
  }, []);

  const onDragEnd = useCallback(() => {
    dragFieldRef.current = null;
    dragSourceRef.current = null;
    setDragOverZone(null);
    if (autoApply && !editMode) setShowHotZones(false);
    // Clean up ghost element
    if (dragGhostRef.current) {
      document.body.removeChild(dragGhostRef.current);
      dragGhostRef.current = null;
    }
  }, [autoApply, editMode]);

  const onZoneDragOver = useCallback((e: DragEvent, zoneId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverZone(zoneId);
    // Set trailing indicator as fallback if not already over a specific slot
    setDropIndicator(prev => {
      if (prev && prev.zone === zoneId) return prev;
      const fields = (pendingZoneFields ?? zoneFields)[zoneId as ZoneId] ?? [];
      return { zone: zoneId as ZoneId, index: fields.length };
    });
  }, [pendingZoneFields, zoneFields]);

  const onZoneDragLeave = useCallback(() => setDragOverZone(null), []);

  const onZoneDrop = useCallback((e: DragEvent, zoneId: ZoneId) => {
    e.preventDefault();
    const fieldId = dragFieldRef.current;
    if (!fieldId) return;
    const source = dragSourceRef.current;

    const update = (prev: Record<ZoneId, string[]>): Record<ZoneId, string[]> => {
      const next = { ...prev };
      // remove from source zone
      if (source && source !== 'column-list') {
        next[source.zone] = next[source.zone].filter(id => id !== fieldId);
      }
      if (!next[zoneId].includes(fieldId)) {
        next[zoneId] = [...next[zoneId], fieldId];
      }
      return next;
    };

    if (autoApply) {
      setZoneFields(update);
      if (!editMode) setShowHotZones(false);
    } else {
      setPendingZoneFields(prev => update(prev ?? zoneFields));
    }
    setDragOverZone(null);
  }, [autoApply, zoneFields, editMode]);

  // drop back to column list
  const onColumnListDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    const fieldId = dragFieldRef.current;
    const source = dragSourceRef.current;
    if (!fieldId || !source || source === 'column-list') return;

    const update = (prev: Record<ZoneId, string[]>): Record<ZoneId, string[]> => ({
      ...prev,
      [source.zone]: prev[source.zone].filter(id => id !== fieldId),
    });

    if (autoApply) setZoneFields(update);
    else setPendingZoneFields(prev => update(prev ?? zoneFields));
  }, [autoApply, zoneFields]);

  // remove tag via ×
  const removeTag = useCallback((zoneId: ZoneId, fieldId: string) => {
    const update = (prev: Record<ZoneId, string[]>): Record<ZoneId, string[]> => ({
      ...prev,
      [zoneId]: prev[zoneId].filter(id => id !== fieldId),
    });
    if (autoApply) setZoneFields(update);
    else setPendingZoneFields(prev => update(prev ?? zoneFields));
  }, [autoApply, zoneFields]);

  // drop at specific index (handles ALL sources: column-list, other zone, same zone reorder)
  const onTagDrop = useCallback((e: DragEvent, zoneId: ZoneId, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const fieldId = dragFieldRef.current;
    const source = dragSourceRef.current;
    if (!fieldId) return;

    const update = (prev: Record<ZoneId, string[]>): Record<ZoneId, string[]> => {
      const next = { ...prev };
      // Remove from source zone if it came from a zone
      if (source && source !== 'column-list') {
        next[source.zone] = next[source.zone].filter(id => id !== fieldId);
      }
      // Compute adjusted index (if moving within same zone and removing shifted indices)
      let insertIdx = targetIndex;
      if (source && source !== 'column-list' && source.zone === zoneId) {
        const oldIdx = prev[zoneId].indexOf(fieldId);
        if (oldIdx !== -1 && oldIdx < targetIndex) {
          insertIdx = targetIndex - 1;
        }
      }
      // Insert at target index (or append if already present)
      const arr = [...next[zoneId].filter(id => id !== fieldId)];
      arr.splice(insertIdx, 0, fieldId);
      next[zoneId] = arr;
      return next;
    };

    if (autoApply) {
      setZoneFields(update);
      if (!editMode) setShowHotZones(false);
    } else {
      setPendingZoneFields(prev => update(prev ?? zoneFields));
    }
    setDragOverZone(null);
  }, [autoApply, zoneFields, editMode]);

  // apply / reset
  const handleApply = useCallback(() => {
    if (pendingZoneFields) {
      setZoneFields(pendingZoneFields);
      setPendingZoneFields(null);
    }
    // Restore autoApply if exiting edit mode
    if (editMode) {
      setAutoApply(savedAutoApplyRef.current);
    }
    setShowHotZones(false);
    setEditMode(false);
  }, [pendingZoneFields, editMode]);

  const handleReset = useCallback(() => {
    setZoneFields({ x_axis: [], left_y_axis: [], right_y_axis: [], columns_by: [] });
    setPendingZoneFields(null);
    setShowHotZones(false);
    setEditMode(false);
  }, []);

  // toggle edit mode
  const savedAutoApplyRef = useRef(false);
  const toggleEditMode = useCallback(() => {
    setEditMode(prev => {
      const next = !prev;
      if (next) {
        // Entering edit mode: save autoApply, disable it, create pending snapshot
        savedAutoApplyRef.current = autoApply;
        setAutoApply(false);
        setPendingZoneFields(zoneFields);
        setShowHotZones(true);
      } else {
        // Cancel: discard pending changes, restore autoApply
        setPendingZoneFields(null);
        setAutoApply(savedAutoApplyRef.current);
        setShowHotZones(false);
      }
      return next;
    });
  }, [autoApply, zoneFields]);

  if (!open) return null;

  // ─── drop indicator (dashed rectangle placeholder) ────────────────
  const renderDropLine = (isActive: boolean, _vertical: boolean) => {
    if (!isActive) return null;
    return (
      <div style={{
        width: 80, height: 24, flexShrink: 0,
        border: '2px dashed #2563eb',
        borderRadius: 4,
        background: 'rgba(37,99,235,0.06)',
      }} />
    );
  };

  // ─── tag renderer ──────────────────────────────────────────────────
  const renderTag = (zoneId: ZoneId, fId: string, idx: number, vertical: boolean) => {
    const isIndicatorBefore = dropIndicator?.zone === zoneId && dropIndicator.index === idx;
    return (
      <div key={fId} style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center', gap: 0 }}>
        {/* Drop indicator BEFORE this tag */}
        <div
          onDragOver={e => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            setDropIndicator({ zone: zoneId, index: idx });
          }}
          onDrop={e => { setDropIndicator(null); onTagDrop(e, zoneId, idx); }}
          style={{
            padding: vertical ? '1px 0' : '0 1px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minWidth: vertical ? '100%' : 8,
            minHeight: vertical ? 8 : '100%',
          }}
        >
          {renderDropLine(isIndicatorBefore, vertical)}
        </div>
        {/* The tag itself */}
        <div
          draggable
          onDragStart={e => onDragStart(e, fId, { zone: zoneId, index: idx })}
          onDragEnd={() => { setDropIndicator(null); onDragEnd(); }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: C.accentLight, color: C.accent, borderRadius: 4,
            padding: '3px 8px 3px 10px', fontSize: 12, fontWeight: 500,
            cursor: 'grab', whiteSpace: 'nowrap', userSelect: 'none',
            border: '1.5px solid transparent',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
        >
          {fieldLabel(fId)}
          <span
            onClick={() => removeTag(zoneId, fId)}
            style={{ cursor: 'pointer', fontWeight: 700, fontSize: 15, lineHeight: 1, marginLeft: 2, color: C.accent, opacity: 0.7 }}
          >×</span>
        </div>
      </div>
    );
  };

  // ─── trailing drop indicator (after last tag) ─────────────────────
  const renderTrailingDrop = (zoneId: ZoneId, vertical: boolean) => {
    const tags = displayZoneFields[zoneId];
    const idx = tags.length;
    const isActive = dropIndicator?.zone === zoneId && dropIndicator.index === idx;
    return (
      <div
        onDragOver={e => {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
          setDropIndicator({ zone: zoneId, index: idx });
        }}
        onDrop={e => { setDropIndicator(null); onTagDrop(e, zoneId, idx); }}
        style={{
          padding: vertical ? '1px 0' : '0 1px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flex: 1,
          minWidth: vertical ? '100%' : 16,
          minHeight: vertical ? 16 : '100%',
        }}
      >
        {renderDropLine(isActive, vertical)}
      </div>
    );
  };

  // ─── hot-zone renderer (only visible during drag, contains tags + drop indicators) ───
  const renderHotZone = (zone: ZoneDef, pos: CSSProperties) => {
    const isOver = dragOverZone === zone.id;
    const visible = showHotZones || editMode;
    const tags = displayZoneFields[zone.id];
    const vertical = zone.id === 'left_y_axis' || zone.id === 'right_y_axis';
    // X axis uses column layout (title on top, tags row below)
    const isXAxis = zone.id === 'x_axis';
    const zoneTitle = zone.id === 'left_y_axis' ? 'Y-1 (L)'
      : zone.id === 'right_y_axis' ? 'Y-1 (R)'
      : zone.id === 'x_axis' ? 'X-1'
      : zone.label;

    return (
      <div
        onDragOver={e => onZoneDragOver(e, zone.id)}
        onDragLeave={e => {
          const related = e.relatedTarget as Node | null;
          if (!related || !e.currentTarget.contains(related)) {
            onZoneDragLeave();
            setDropIndicator(null);
          }
        }}
        onDrop={e => { setDropIndicator(null); onZoneDrop(e, zone.id); }}
        style={{
          position: 'absolute', ...pos,
          display: 'flex',
          flexDirection: isXAxis ? 'column' : (vertical ? 'column' : 'row'),
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: isXAxis ? 'nowrap' : 'nowrap', gap: 0,
          background: isOver ? C.hotzoneActive : C.hotzone,
          border: `2px dashed ${isOver ? C.hotzoneBorder : '#b0bbd5'}`,
          borderRadius: 6, transition: 'opacity 0.15s',
          padding: vertical ? '8px 6px' : '4px 8px',
          zIndex: 10, minHeight: 34, boxSizing: 'border-box',
          overflowX: 'hidden', overflowY: vertical ? 'auto' : 'hidden',
          opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none',
        }}
      >
        {tags.length > 0 ? (
          <>
            {/* Zone title - bigger, dark blue */}
            <div style={{
              fontSize: 13, color: '#1a3a7a', fontWeight: 700, letterSpacing: 0.3,
              marginBottom: (vertical || isXAxis) ? 6 : 0,
              marginRight: (!vertical && !isXAxis) ? 10 : 0,
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {zoneTitle}
            </div>
            {/* Tags row */}
            <div style={{
              display: 'flex',
              flexDirection: vertical ? 'column' : 'row',
              alignItems: 'center', justifyContent: 'center',
              gap: 0, flexWrap: 'wrap',
            }}>
              {tags.map((fId, idx) => renderTag(zone.id, fId, idx, vertical))}
              {renderTrailingDrop(zone.id, vertical)}
            </div>
          </>
        ) : (
          <span style={{ fontSize: 13, color: C.accent, fontWeight: 600, letterSpacing: 0.3 }}>{zone.label}</span>
        )}
      </div>
    );
  };

  // ═════════════════════════════════════════════════════════════════════
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.15)' }}>
      <div style={{
        width: 1580, height: 939, maxWidth: '100vw', maxHeight: '100vh',
        background: C.card, borderRadius: 10,
        boxShadow: '0 4px 32px rgba(0,0,0,0.12)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 20px', borderBottom: `1px solid ${C.border}`, background: C.bg, flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: C.text }}>Plot Configuration</span>
        </div>

        {/* ── Body ── */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

          {/* ── Left: Plot Area ── */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* chart type selector - same height as Color By / Column List headers */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, height: 42, boxSizing: 'border-box' }}>
              {(['Bar', 'Line', 'Box', 'Scatter'] as ChartType[]).map(ct => (
                <button key={ct} onClick={() => setChartType(ct)} style={{
                  padding: '5px 18px', fontSize: 13,
                  fontWeight: chartType === ct ? 600 : 400,
                  background: chartType === ct ? C.accent : 'transparent',
                  color: chartType === ct ? '#fff' : C.text,
                  border: `1px solid ${chartType === ct ? C.accent : C.border}`,
                  borderRadius: 4, cursor: 'pointer', transition: 'all 0.15s',
                }}>{ct}</button>
              ))}
            </div>

            {/* canvas with hot zone overlays (only visible during drag) */}
            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
              {/* White overlay when hot zones visible */}
              {(showHotZones || editMode) && (
                <div style={{
                  position: 'absolute', inset: 0, zIndex: 5,
                  background: 'rgba(255,255,255,0.88)',
                  backdropFilter: 'blur(2px)',
                  transition: 'opacity 0.2s',
                  pointerEvents: 'none',
                }} />
              )}

              {/* Hot zones: 4px outer margin, 4px gap between zones, Y axes both 120px wide */}
              {renderHotZone(DROP_ZONES[3], { top: 4, left: 128, right: 128, height: 48 })}
              {renderHotZone(DROP_ZONES[1], { left: 4, top: 56, bottom: 76, width: 120 })}
              {renderHotZone(DROP_ZONES[2], { right: 4, top: 56, bottom: 76, width: 120 })}
              {renderHotZone(DROP_ZONES[0], { bottom: 4, left: 128, right: 128, height: 68 })}

              {/* Chart / placeholder */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px' }}>
                {chartOption ? (
                  <ReactECharts option={chartOption} style={{ width: '100%', height: '100%' }} notMerge lazyUpdate />
                ) : (
                  <div style={{ textAlign: 'center', color: C.textSec }}>
                    <div style={{ fontSize: 44, marginBottom: 12 }}>📊</div>
                    <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>Drag fields to the canvas</div>
                    <div style={{ fontSize: 13 }}>Drop fields onto <b>X Axis</b> and <b>Y Axis</b> hot zones to build your chart</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Middle: Color By Panel (200px) ── */}
          <div style={{
            width: 200, flexShrink: 0,
            borderLeft: `1px solid ${C.border}`,
            display: 'flex', flexDirection: 'column', background: C.card,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', borderBottom: `1px solid ${C.border}`, height: 42, boxSizing: 'border-box', flexShrink: 0 }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: C.text }}>Color By</span>
              <button
                onClick={handleReset}
                title="Refresh"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                  fontSize: 16, color: C.textSec, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 4, transition: 'color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = C.accent)}
                onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}
              >↻</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
              {(() => {
                const allSeriesSet = new Set([...zoneFields.left_y_axis, ...zoneFields.right_y_axis]);
                // Use FIELD_LIST order for stable legend
                const orderedSeries = FIELD_LIST.filter(f => allSeriesSet.has(f.id)).map(f => f.id);
                if (orderedSeries.length === 0 && zoneFields.x_axis.length === 0) {
                  return <div style={{ fontSize: 12, color: C.textSec, textAlign: 'center', padding: 20 }}>No fields configured</div>;
                }
                const colors = ['#5470c6','#91cc75','#fac858','#ee6666','#73c0de','#3ba272','#fc8452','#9a60b4','#ea7ccc'];
                return orderedSeries.map((fId, i) => (
                  <div key={fId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px', fontSize: 12, color: C.text }}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, background: colors[i % colors.length], flexShrink: 0 }} />
                    {fieldLabel(fId)}
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* ── Right: Column List (200px) ── */}
          <div
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
            onDrop={onColumnListDrop}
            style={{
              width: 200, flexShrink: 0,
              borderLeft: `1px solid ${C.border}`,
              display: 'flex', flexDirection: 'column', background: C.bg,
            }}
          >
            {/* Header row: Column List + Auto Apply on same line, same height as chart type bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', borderBottom: `1px solid ${C.border}`, height: 42, boxSizing: 'border-box', flexShrink: 0 }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: C.text }}>Column List</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: editMode ? '#bbb' : C.textSec, cursor: editMode ? 'not-allowed' : 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={autoApply} disabled={editMode} onChange={e => {
                  setAutoApply(e.target.checked);
                  if (e.target.checked && pendingZoneFields) {
                    setZoneFields(pendingZoneFields);
                    setPendingZoneFields(null);
                    setShowHotZones(false);
                  }
                }} style={{ accentColor: C.accent, width: 13, height: 13 }} />
                Auto Apply
              </label>
            </div>

            {/* fields - show ALL, style configured ones */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 8px' }}>
              {FIELD_LIST.map(f => {
                const isUsed = usedFieldIds.has(f.id);
                return (
                  <div
                    key={f.id} draggable
                    onDragStart={e => onDragStart(e, f.id, 'column-list')}
                    onDragEnd={onDragEnd}
                    style={{
                      padding: '6px 10px', marginBottom: 3,
                      background: isUsed ? C.accentLight : C.card,
                      border: `1px solid ${isUsed ? C.accent : C.border}`,
                      borderRadius: 4, fontSize: 12, cursor: 'grab',
                      userSelect: 'none',
                      color: isUsed ? C.accent : C.text,
                      fontWeight: isUsed ? 500 : 400,
                      transition: 'all 0.15s',
                      position: 'relative',
                    }}
                    onMouseEnter={e => { if (!isUsed) e.currentTarget.style.background = C.tag; }}
                    onMouseLeave={e => { if (!isUsed) e.currentTarget.style.background = C.card; }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center' }}>
                      {fieldIcon(f.id)}
                      {f.label}
                    </span>
                    {isUsed && <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: C.accent, opacity: 0.7 }}>✓</span>}
                  </div>
                );
              })}
            </div>

            {/* Reset / Edit / Apply */}
            <div style={{ padding: '8px 10px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 6 }}>
              <button onClick={handleReset} style={{
                flex: 1, padding: '6px 0', fontSize: 12,
                border: `1px solid ${C.border}`, borderRadius: 4,
                background: C.card, cursor: 'pointer', color: C.text,
              }}>Reset</button>
              <button onClick={toggleEditMode} style={{
                flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 600,
                background: editMode ? C.accent : 'transparent',
                color: editMode ? '#fff' : C.accent,
                border: `1px solid ${C.accent}`,
                borderRadius: 4, cursor: 'pointer', transition: 'all 0.15s',
              }}>{editMode ? 'Cancel' : 'Edit'}</button>
              <button onClick={handleApply} style={{
                flex: 1, padding: '6px 0', fontSize: 12, border: 'none', borderRadius: 4,
                background: C.accent,
                color: '#fff', cursor: 'pointer',
                fontWeight: 600,
              }}>Apply</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
