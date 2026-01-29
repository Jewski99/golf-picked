'use client';

import { useState, useEffect } from 'react';

interface Event {
  id: string;
  name: string;
  startDatetime: string;
  endDatetime: string;
  course: string;
  location: string;
  status: string;
}

export default function EventSelector({ onEventSelect }: { onEventSelect: (event: Event | null) => void }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const response = await fetch(
        `https://use.livegolfapi.com/v1/events?api_key=${process.env.NEXT_PUBLIC_LIVEGOLF_API_KEY}&tour=pga-tour`
      );
      const data = await response.json();
      
      // Filter for current/upcoming events
      const now = new Date();
      const relevantEvents = data.filter((event: Event) => {
        const endDate = new Date(event.endDatetime);
        return endDate >= now;
      });

      setEvents(relevantEvents);
      
      // Auto-select the current or next upcoming event
      const current = relevantEvents.find((event: Event) => {
        const start = new Date(event.startDatetime);
        const end = new Date(event.endDatetime);
        return start <= now && end >= now;
      }) || relevantEvents[0];
      
      if (current) {
        setCurrentEvent(current);
        onEventSelect(current);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEventChange = (eventId: string) => {
    const selected = events.find(e => e.id === eventId);
    setCurrentEvent(selected || null);
    onEventSelect(selected || null);
  };

  if (loading) {
    return (
      <div className="bg-slate-900/50 backdrop-blur-sm border border-emerald-500/20 rounded-xl p-6">
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-3 py-1">
            <div className="h-4 bg-slate-700 rounded w-3/4"></div>
            <div className="h-3 bg-slate-700 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentEvent) {
    return (
      <div className="bg-slate-900/50 backdrop-blur-sm border border-emerald-500/20 rounded-xl p-6">
        <p className="text-slate-400">No upcoming events found</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/50 backdrop-blur-sm border border-emerald-500/20 rounded-xl p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            {currentEvent.name}
          </h2>
          <div className="flex flex-wrap gap-4 text-sm text-slate-400">
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {currentEvent.location}
            </div>
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {new Date(currentEvent.startDatetime).toLocaleDateString()} - {new Date(currentEvent.endDatetime).toLocaleDateString()}
            </div>
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
              </svg>
              {currentEvent.course}
            </div>
          </div>
        </div>
        
        <select
          value={currentEvent.id}
          onChange={(e) => handleEventChange(e.target.value)}
          className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500 transition-colors"
        >
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
