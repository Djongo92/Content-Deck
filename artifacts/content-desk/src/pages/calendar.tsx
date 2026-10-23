import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, parseISO, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, FilePlus2, MapPin, Repeat, Rocket, Scale } from 'lucide-react';
import { toast } from 'sonner';
import { DeliverableModal } from '@/components/deliverable-modal';
import { EventModal } from '@/components/event-modal';
import { TemplatesModal } from '@/components/templates-modal';
import { useMutateStore, useStore } from '@/hooks/use-store';
import { cn } from '@/lib/utils';

const LAUNCH_FILTER_ID = '__launch__';

export default function CalendarPage() {
  const { deliverables, events, clients, metrics, launchTasks } = useStore();
  const { updateDeliverable, updateEvent, generateFromTemplates } = useMutateStore();
  const [, navigate] = useLocation();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeDeliverableId, setActiveDeliverableId] = useState<string | null>(null);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [newTicketDate, setNewTicketDate] = useState<Date | undefined>();
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [balanceView, setBalanceView] = useState(false);
  const activeClients = useMemo(() => clients.filter(client => !client.archived), [clients]);
  const clientMap = useMemo(() => Object.fromEntries(clients.map(client => [client.id, client])), [clients]);

  // Client filter: which clients (and the pseudo "Algo-Rhythm launch" bucket)
  // are currently shown. Hidden ids only hide active clients -- an archived
  // client's past content stays visible, same as before this filter existed.
  const [hiddenFilterIds, setHiddenFilterIds] = useState<Set<string>>(new Set());
  const toggleFilter = (id: string) => setHiddenFilterIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const activeClientIds = useMemo(() => new Set(activeClients.map(client => client.id)), [activeClients]);
  const isClientHidden = (clientId?: string | null) => !!clientId && activeClientIds.has(clientId) && hiddenFilterIds.has(clientId);
  const showLaunchTasks = !hiddenFilterIds.has(LAUNCH_FILTER_ID);
  const visibleClients = useMemo(() => activeClients.filter(client => !hiddenFilterIds.has(client.id)), [activeClients, hiddenFilterIds]);
  const filteredDeliverables = useMemo(
    () => deliverables.filter(deliverable => !isClientHidden(deliverable.clientId)),
    [deliverables, activeClientIds, hiddenFilterIds]
  );
  const filteredEvents = useMemo(
    () => events.filter(calendarEvent => !isClientHidden(calendarEvent.clientId)),
    [events, activeClientIds, hiddenFilterIds]
  );

  const unscheduled = useMemo(
    () => filteredDeliverables.filter(deliverable => !deliverable.publishAt && !deliverable.productionDueAt),
    [filteredDeliverables]
  );
  const contentGaps = useMemo(() => {
    const now = new Date();
    const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    return visibleClients.filter(client => !deliverables.some(d => {
      if (d.clientId !== client.id || !d.publishAt) return false;
      const publishAt = parseISO(d.publishAt);
      return publishAt >= now && publishAt <= horizon;
    }));
  }, [visibleClients, deliverables]);

  useEffect(() => {
    generateFromTemplates(4);
  }, [generateFromTemplates]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const monthWeeks = useMemo(() => {
    const weeks: Date[][] = [];
    for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));
    return weeks;
  }, [days]);

  const itemsByDate = useMemo(() => {
    const map: Record<string, Array<
      | { kind: 'content'; item: typeof deliverables[number] }
      | { kind: 'event'; item: typeof events[number] }
      | { kind: 'launch'; item: typeof launchTasks[number] }
    >> = {};
    filteredDeliverables.forEach(deliverable => {
      const date = deliverable.publishAt || deliverable.productionDueAt;
      if (!date) return;
      const key = format(parseISO(date), 'yyyy-MM-dd');
      (map[key] ||= []).push({ kind: 'content', item: deliverable });
    });
    filteredEvents.forEach(calendarEvent => {
      const key = format(parseISO(calendarEvent.startAt), 'yyyy-MM-dd');
      (map[key] ||= []).push({ kind: 'event', item: calendarEvent });
    });
    // Launch tasks are read-only here — surfaced for visibility, edited on the Launch page.
    if (showLaunchTasks) {
      launchTasks.forEach(task => {
        if (task.done || !task.due) return;
        (map[task.due] ||= []).push({ kind: 'launch', item: task });
      });
    }
    Object.values(map).forEach(items => items.sort((a, b) => {
      const aDate = a.kind === 'content' ? (a.item.publishAt || a.item.productionDueAt || '') : a.kind === 'event' ? a.item.startAt : a.item.due;
      const bDate = b.kind === 'content' ? (b.item.publishAt || b.item.productionDueAt || '') : b.kind === 'event' ? b.item.startAt : b.item.due;
      return aDate.localeCompare(bDate);
    }));
    return map;
  }, [filteredDeliverables, filteredEvents, launchTasks, showLaunchTasks]);

  const monthHours = useMemo(() => Object.fromEntries(activeClients.map(client => {
    const hours = deliverables
      .filter(deliverable => deliverable.clientId === client.id && [deliverable.publishAt, deliverable.productionDueAt]
        .some(date => date && isSameMonth(parseISO(date), currentDate)))
      .reduce((sum, deliverable) => sum + (deliverable.actualHours || 0), 0);
    return [client.id, hours];
  })), [activeClients, deliverables, currentDate]);

  const bestTimes = useMemo(() => {
    const latestMetric = new Map<string, typeof metrics[number]>();
    metrics.forEach(metric => {
      const existing = latestMetric.get(metric.deliverableId);
      if (!existing || metric.capturedAt > existing.capturedAt) latestMetric.set(metric.deliverableId, metric);
    });
    const groups = new Map<string, { date: Date; engagement: number }[]>();
    deliverables.forEach(deliverable => {
      const metric = latestMetric.get(deliverable.id);
      if (deliverable.publishingStatus !== 'published' || !deliverable.publishAt || !metric) return;
      const key = `${deliverable.clientId}::${deliverable.platform}`;
      const engagement = metric.likes + metric.comments + metric.shares;
      const entries = groups.get(key) || [];
      entries.push({ date: parseISO(deliverable.publishAt), engagement });
      groups.set(key, entries);
    });
    const result: Record<string, string[]> = {};
    groups.forEach((entries, key) => {
      if (entries.length < 3) return;
      const weights = entries.map(entry => Math.max(1, entry.engagement));
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      const hour = Math.round(entries.reduce((sum, entry, index) => sum + entry.date.getHours() * weights[index], 0) / total) % 24;
      const dayWeights = Array(7).fill(0) as number[];
      entries.forEach((entry, index) => { dayWeights[entry.date.getDay()] += weights[index]; });
      const weekday = dayWeights.indexOf(Math.max(...dayWeights));
      const [clientId, platform] = key.split('::');
      (result[clientId] ||= []).push(`${platform}: ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday]} around ${String(hour).padStart(2, '0')}:00`);
    });
    return result;
  }, [deliverables, metrics]);

  const balance = useMemo(() => {
    const counts: Record<string, number[][]> = {};
    const warnings: string[] = [];
    visibleClients.forEach(client => {
      counts[client.id] = monthWeeks.map(week => {
        const weekItems = deliverables.filter(deliverable => deliverable.clientId === client.id && deliverable.publishAt
          && week.some(day => isSameMonth(day, currentDate) && format(day, 'yyyy-MM-dd') === deliverable.publishAt?.slice(0, 10)));
        const platforms = weekItems.reduce((acc, item) => ({ ...acc, [item.platform]: (acc[item.platform] || 0) + 1 }), {} as Record<string, number>);
        Object.entries(platforms).forEach(([platform, count]) => {
          if (weekItems.length && count / weekItems.length > 0.6) {
            warnings.push(`${client.name}: ${count} of ${weekItems.length} posts this week are ${platform}`);
          }
        });
        return [weekItems.length];
      });
    });
    return { counts, warnings };
  }, [visibleClients, monthWeeks, deliverables, currentDate]);

  const openNewContent = (day?: Date) => {
    setNewTicketDate(day);
    setActiveDeliverableId('new');
  };

  const openNewEvent = (day?: Date) => {
    setNewTicketDate(day);
    setActiveEventId('new');
  };

  const handleDrop = (payload: string, day: Date) => {
    let ticket: { kind: 'content' | 'event'; id: string };
    try {
      ticket = JSON.parse(payload);
    } catch {
      ticket = { kind: 'content', id: payload };
    }
    if (ticket.kind === 'event') {
      const item = events.find(event => event.id === ticket.id);
      if (!item) return;
      const prior = parseISO(item.startAt);
      const duration = new Date(item.endAt).getTime() - prior.getTime();
      const next = new Date(day);
      next.setHours(prior.getHours(), prior.getMinutes(), 0, 0);
      updateEvent(item.id, {
        startAt: next.toISOString(),
        endAt: new Date(next.getTime() + duration).toISOString(),
      });
      toast.success(`Moved “${item.title}” to ${format(next, 'MMM d')}`);
      return;
    }
    const item = deliverables.find(deliverable => deliverable.id === ticket.id);
    if (!item) return;
    const prior = item.publishAt ? parseISO(item.publishAt) : new Date();
    const next = new Date(day);
    next.setHours(prior.getHours(), prior.getMinutes(), 0, 0);
    updateDeliverable(item.id, { publishAt: next.toISOString(), publishingStatus: 'scheduled' });
    const client = clientMap[item.clientId];
    if (!client?.monthlyRetainerHours) return;
    const targetHours = deliverables
      .filter(deliverable => deliverable.clientId === item.clientId && deliverable.id !== item.id
        && [deliverable.publishAt, deliverable.productionDueAt].some(date => date && isSameMonth(parseISO(date), next)))
      .reduce((sum, deliverable) => sum + (deliverable.estimatedHours || 0), 0) + (item.estimatedHours || 0);
    const percentage = Math.round(targetHours / client.monthlyRetainerHours * 100);
    if (percentage > 100) toast.warning(`${client.name} is at ${percentage}% of the monthly retainer — consider scheduling in a later month.`);
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col overflow-y-auto p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-serif capitalize text-foreground">{format(currentDate, 'MMMM yyyy')}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => setBalanceView(value => !value)} className={cn('flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm', balanceView ? 'bg-primary text-primary-foreground' : 'bg-secondary')}>
            <Scale className="h-4 w-4" /> <span className="hidden sm:inline">Balance</span>
          </button>
          <button onClick={() => setTemplatesOpen(true)} className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm"><Repeat className="h-4 w-4" /> <span className="hidden sm:inline">Series</span></button>
          <div className="flex items-center overflow-hidden rounded-md border border-border bg-secondary">
            <button onClick={() => setCurrentDate(date => subMonths(date, 1))} className="p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronLeft className="h-5 w-5" /></button>
            <button onClick={() => setCurrentDate(new Date())} className="border-x border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">Today</button>
            <button onClick={() => setCurrentDate(date => addMonths(date, 1))} className="p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronRight className="h-5 w-5" /></button>
          </div>
          <button onClick={() => openNewContent()} className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium hover:bg-muted"><FilePlus2 className="h-4 w-4" /> <span className="hidden sm:inline">New content</span></button>
          <button onClick={() => openNewEvent()} className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:brightness-110"><CalendarPlus className="h-4 w-4" /> <span className="hidden sm:inline">New event</span></button>
        </div>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Show:</span>
        {activeClients.map(client => {
          const hidden = hiddenFilterIds.has(client.id);
          return (
            <button
              key={client.id}
              onClick={() => toggleFilter(client.id)}
              className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition', hidden && 'border-border bg-secondary/40 text-muted-foreground opacity-50')}
              style={hidden ? undefined : { backgroundColor: `${client.color}22`, borderColor: `${client.color}60`, color: client.color }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: client.color }} />
              {client.name}
            </button>
          );
        })}
        <button
          onClick={() => toggleFilter(LAUNCH_FILTER_ID)}
          className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition', !showLaunchTasks && 'border-border bg-secondary/40 text-muted-foreground opacity-50')}
          style={showLaunchTasks ? { backgroundColor: '#d94e3822', borderColor: '#d94e3860', color: '#d94e38' } : undefined}
        >
          <Rocket className="h-3 w-3" /> Algo-Rhythm launch
        </button>
        {hiddenFilterIds.size > 0 && (
          <button onClick={() => setHiddenFilterIds(new Set())} className="text-xs text-primary hover:underline">Show all</button>
        )}
      </div>

      <div className="grid flex-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        {balanceView ? (
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="overflow-x-auto p-5">
              <table className="w-full min-w-[600px] text-sm">
                <thead><tr><th className="pb-3 text-left font-medium text-muted-foreground">Client</th>{monthWeeks.map(week => <th key={week[0].toISOString()} className="pb-3 text-center font-medium text-muted-foreground">{format(week.find(day => isSameMonth(day, currentDate)) || week[0], 'MMM d')}</th>)}</tr></thead>
                <tbody>{visibleClients.map(client => (
                  <tr key={client.id} className="border-t border-border">
                    <td className="py-3 font-medium"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: client.color }} />{client.name}</td>
                    {monthWeeks.map((week, index) => {
                      const count = balance.counts[client.id]?.[index]?.[0] || 0;
                      return <td key={week[0].toISOString()} className="p-2 text-center"><div className="rounded-md border px-3 py-4 font-serif text-lg" style={{ backgroundColor: `${client.color}${count ? Math.min(80, 18 + count * 14).toString(16).padStart(2, '0') : '08'}`, borderColor: `${client.color}55` }}>{count}</div></td>;
                    })}
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="border-t border-border p-5">
              <h3 className="mb-2 text-sm font-medium">Mix warnings</h3>
              {balance.warnings.map((warning, index) => <p key={`${warning}-${index}`} className="py-1 text-sm text-muted-foreground">{warning}</p>)}
              {!balance.warnings.length && <p className="text-sm text-muted-foreground">No platform concentration warnings this month.</p>}
            </div>
          </section>
        ) : (
          <>
          {/* Mobile agenda: days as stacked cards; tap to open, edit dates inside the deliverable */}
          <div className="space-y-4 md:hidden">
            {unscheduled.length > 0 && (
              <section className="overflow-hidden rounded-xl border border-dashed border-primary/40 bg-card">
                <div className="border-b border-border bg-secondary/30 px-4 py-2.5">
                  <span className="font-serif text-base text-foreground">Unscheduled</span>
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">{unscheduled.length} item{unscheduled.length === 1 ? '' : 's'}</span>
                </div>
                <div className="divide-y divide-border">
                  {unscheduled.map(item => (
                    <button key={item.id} onClick={() => setActiveDeliverableId(item.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-secondary/40">
                      <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: clientMap[item.clientId]?.color || '#555' }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{clientMap[item.clientId]?.name} · no date — tap to edit</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {days.filter(day => isSameMonth(day, currentDate) && ((itemsByDate[format(day, 'yyyy-MM-dd')] || []).length > 0 || isToday(day))).map(day => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const dayItems = itemsByDate[dateKey] || [];
              return (
                <section key={dateKey} className={cn('overflow-hidden rounded-xl border bg-card', isToday(day) ? 'border-primary/50' : 'border-border')}>
                  <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-2.5">
                    <div className="flex items-baseline gap-2">
                      <span className={cn('font-serif text-base', isToday(day) ? 'font-bold text-primary' : 'text-foreground')}>{format(day, 'EEE d')}</span>
                      {isToday(day) && <span className="text-[10px] font-medium uppercase tracking-wider text-primary">Today</span>}
                    </div>
                    <div className="flex items-center">
                      <button onClick={() => openNewContent(day)} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-primary" aria-label="Add content"><FilePlus2 className="h-4 w-4" /></button>
                      <button onClick={() => openNewEvent(day)} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-primary" aria-label="Add event"><CalendarPlus className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <div className="divide-y divide-border">
                    {dayItems.map(ticket => {
                      const item = ticket.item;
                      const content = ticket.kind === 'content' ? ticket.item : undefined;
                      const calendarEvent = ticket.kind === 'event' ? ticket.item : undefined;
                      const launchTask = ticket.kind === 'launch' ? ticket.item : undefined;
                      const client = content ? clientMap[content.clientId] : calendarEvent?.clientId ? clientMap[calendarEvent.clientId] : undefined;
                      return (
                        <button
                          key={`${ticket.kind}-${item.id}`}
                          onClick={() => ticket.kind === 'content' ? setActiveDeliverableId(item.id) : ticket.kind === 'event' ? setActiveEventId(item.id) : navigate('/launch')}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-secondary/40"
                        >
                          <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: ticket.kind === 'event' ? '#C6A15B' : ticket.kind === 'launch' ? '#d94e38' : client?.color || '#555' }} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 truncate text-sm font-medium">{launchTask && <Rocket className="h-3 w-3 shrink-0 text-muted-foreground" />}{content?.seriesId && <Repeat className="h-3 w-3 shrink-0 text-muted-foreground" />}{item.title}</span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {calendarEvent
                                ? `${calendarEvent.eventType === 'shoot' ? 'Content shoot' : calendarEvent.eventType} · ${format(parseISO(calendarEvent.startAt), 'HH:mm')}${calendarEvent.location ? ` · ${calendarEvent.location}` : ''}`
                                : launchTask
                                ? `Algo-Rhythm launch · ${launchTask.owner}`
                                : `${client?.name} · ${format(parseISO(content!.publishAt || content!.productionDueAt!), 'HH:mm')}`}
                            </span>
                          </span>
                          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] capitalize text-muted-foreground">{ticket.kind}</span>
                        </button>
                      );
                    })}
                    {!dayItems.length && <p className="px-4 py-3 text-xs text-muted-foreground">Nothing scheduled — tap + to add.</p>}
                  </div>
                </section>
              );
            })}
            {!days.some(day => isSameMonth(day, currentDate) && (itemsByDate[format(day, 'yyyy-MM-dd')] || []).length > 0) && (
              <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Nothing scheduled this month yet. Tap New to plan the first piece.</p>
            )}
          </div>

          {/* Desktop month grid */}
          <div className="hidden md:flex min-h-[700px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="grid grid-cols-7 border-b border-border bg-secondary/30">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div key={day} className="py-2 text-center text-xs font-medium text-muted-foreground">{day}</div>)}
            </div>
            <div className="grid flex-1 grid-cols-7" style={{ gridTemplateRows: `repeat(${monthWeeks.length}, minmax(100px, 1fr))` }}>
              {days.map(day => {
                const dateKey = format(day, 'yyyy-MM-dd');
                return (
                  <div key={dateKey} className={cn('group flex min-w-0 flex-col gap-1 overflow-hidden border-b border-r border-border p-2 hover:bg-secondary/20', !isSameMonth(day, currentDate) && 'bg-secondary/10 opacity-50', isToday(day) && 'bg-primary/5')} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDrop={event => handleDrop(event.dataTransfer.getData('application/x-content-desk-ticket') || event.dataTransfer.getData('text/plain'), day)}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className={cn('font-serif text-sm', isToday(day) ? 'font-bold text-primary' : 'text-muted-foreground')}>{format(day, 'd')}</span>
                      <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
                        <button onClick={() => openNewContent(day)} className="rounded p-0.5 text-muted-foreground hover:text-primary" title="Add content"><FilePlus2 className="h-3 w-3" /></button>
                        <button onClick={() => openNewEvent(day)} className="rounded p-0.5 text-muted-foreground hover:text-primary" title="Add event"><CalendarPlus className="h-3 w-3" /></button>
                      </div>
                    </div>
                    <div className="flex-1 space-y-1 overflow-y-auto">
                      {(itemsByDate[dateKey] || []).map(ticket => {
                        const item = ticket.item;
                        const content = ticket.kind === 'content' ? ticket.item : undefined;
                        const calendarEvent = ticket.kind === 'event' ? ticket.item : undefined;
                        const isLaunch = ticket.kind === 'launch';
                        const client = content ? clientMap[content.clientId] : calendarEvent?.clientId ? clientMap[calendarEvent.clientId] : undefined;
                        return (
                          <div
                            key={`${ticket.kind}-${item.id}`}
                            onClick={() => ticket.kind === 'content' ? setActiveDeliverableId(item.id) : ticket.kind === 'event' ? setActiveEventId(item.id) : navigate('/launch')}
                            draggable={!isLaunch}
                            onDragStart={isLaunch ? undefined : event => {
                              const payload = JSON.stringify({ kind: ticket.kind, id: item.id });
                              event.dataTransfer.setData('application/x-content-desk-ticket', payload);
                              event.dataTransfer.setData('text/plain', payload);
                              event.dataTransfer.effectAllowed = 'move';
                            }}
                            className={cn('flex items-center gap-1 truncate rounded border px-2 py-1 text-xs hover:brightness-110', ticket.kind === 'event' && 'border-dashed', isLaunch ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing')}
                            style={{ backgroundColor: ticket.kind === 'event' ? '#C6A15B20' : isLaunch ? '#d94e3820' : `${client?.color || '#555'}20`, borderColor: ticket.kind === 'event' ? '#C6A15B70' : isLaunch ? '#d94e3870' : `${client?.color || '#555'}40` }}
                          >
                            {ticket.kind === 'event'
                              ? <CalendarPlus className="h-3 w-3 shrink-0 text-primary" />
                              : isLaunch
                              ? <Rocket className="h-3 w-3 shrink-0" />
                              : content?.seriesId && <Repeat className="h-3 w-3 shrink-0" />}
                            {ticket.kind === 'content' && <span className="opacity-70">{client?.name.substring(0, 2)}</span>}
                            <span className="truncate">{item.title}</span>
                            {calendarEvent?.location && <MapPin className="ml-auto h-3 w-3 shrink-0 opacity-60" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          </>
        )}

        <aside className="space-y-6">
          {unscheduled.length > 0 && (
            <section className="rounded-xl border border-dashed border-primary/40 bg-card p-5">
              <h2 className="font-serif text-lg">Unscheduled</h2>
              <p className="mb-4 mt-1 text-xs text-muted-foreground">Drag onto a day to schedule, or click to edit.</p>
              <div className="space-y-2">
                {unscheduled.map(item => {
                  const client = clientMap[item.clientId];
                  return (
                    <div
                      key={item.id}
                      onClick={() => setActiveDeliverableId(item.id)}
                      draggable
                      onDragStart={event => {
                        const payload = JSON.stringify({ kind: 'content', id: item.id });
                        event.dataTransfer.setData('application/x-content-desk-ticket', payload);
                        event.dataTransfer.setData('text/plain', payload);
                        event.dataTransfer.effectAllowed = 'move';
                      }}
                      className="flex cursor-grab items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm hover:border-primary/50 active:cursor-grabbing"
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: client?.color || '#555' }} />
                      <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{client?.name}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {contentGaps.length > 0 && (
            <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
              <h2 className="flex items-center gap-2 font-serif text-lg"><AlertTriangle className="h-4 w-4 text-amber-600" /> Content gaps</h2>
              <p className="mb-3 mt-1 text-xs text-muted-foreground">Nothing scheduled in the next 2 weeks.</p>
              <div className="space-y-2">
                {contentGaps.map(client => (
                  <div key={client.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2 truncate"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: client.color }} />{client.name}</span>
                    <button onClick={() => openNewContent()} className="shrink-0 text-xs text-primary hover:underline">+ Plan something</button>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-serif text-lg">Monthly capacity</h2>
          <p className="mb-5 mt-1 text-xs text-muted-foreground">Estimated hours for {format(currentDate, 'MMMM')}</p>
          <div className="space-y-6">
            {visibleClients.map(client => {
              const hours = monthHours[client.id] || 0;
              const retainer = client.monthlyRetainerHours || 0;
              const percentage = retainer ? Math.round(hours / retainer * 100) : 0;
              const barClass = percentage > 100 ? 'bg-destructive' : percentage > 90 ? 'bg-amber-500' : '';
              return (
                <div key={client.id}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="truncate font-medium">{client.name}</span><span className="whitespace-nowrap text-muted-foreground">{hours} / {retainer}h</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className={cn('h-full rounded-full', barClass)} style={{ width: `${Math.min(100, percentage)}%`, backgroundColor: barClass ? undefined : client.color }} /></div>
                  <p className={cn('mt-1 text-xs text-muted-foreground', percentage > 100 && 'text-destructive')}>{hours > retainer && retainer > 0 ? `${Math.round((hours - retainer) * 10) / 10}h over retainer` : `${percentage}% of retainer`}</p>
                  {!!bestTimes[client.id]?.length && <div className="mt-2 flex flex-wrap gap-1">{bestTimes[client.id].map(hint => <span key={hint} className="rounded-full border border-border bg-secondary px-2 py-1 text-[10px] text-muted-foreground">Best: {hint}</span>)}</div>}
                </div>
              );
            })}
          </div>
          </section>
        </aside>
      </div>

      {activeDeliverableId && <DeliverableModal deliverableId={activeDeliverableId} initialDate={newTicketDate} onClose={() => { setActiveDeliverableId(null); setNewTicketDate(undefined); }} />}
      {activeEventId && <EventModal eventId={activeEventId} initialDate={newTicketDate} onClose={() => { setActiveEventId(null); setNewTicketDate(undefined); }} />}
      {templatesOpen && <TemplatesModal onClose={() => setTemplatesOpen(false)} />}
    </div>
  );
}