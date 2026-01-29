'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Standing {
  user_id: string;
  username: string;
  total_winnings: number;
}

interface EventResult {
  event_name: string;
  username: string;
  total_earnings: number;
}

export default function Standings() {
  const [seasonStandings, setSeasonStandings] = useState<Standing[]>([]);
  const [eventResults, setEventResults] = useState<{ [key: string]: EventResult[] }>({});
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStandings();
    fetchEvents();
  }, []);

  const fetchStandings = async () => {
    try {
      const { data } = await supabase
        .from('season_standings')
        .select('*')
        .order('total_winnings', { ascending: false });

      setSeasonStandings(data || []);
    } catch (error) {
      console.error('Error fetching standings:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEvents = async () => {
    try {
      // Get all past events from draft_picks
      const { data: picks } = await supabase
        .from('draft_picks')
        .select('event_id, event_name')
        .order('created_at', { ascending: false });

      // Get unique events
      const uniqueEvents = Array.from(
        new Map(picks?.map((p: any) => [p.event_id, p]) || []).values()
      );

      setEvents(uniqueEvents);
      
      // Fetch results for each event
      for (const event of uniqueEvents) {
        await fetchEventResults(event.event_id, event.event_name);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  };

  const fetchEventResults = async (eventId: string, eventName: string) => {
    try {
      const { data } = await supabase
        .from('draft_picks')
        .select(`
          user_id,
          username,
          player_results!inner(earnings)
        `)
        .eq('event_id', eventId);

      // Calculate total earnings per user for this event
      const userEarnings = (data || []).reduce((acc: any, pick: any) => {
        const userId = pick.user_id;
        const earnings = pick.player_results?.earnings || 0;
        if (!acc[userId]) {
          acc[userId] = {
            event_name: eventName,
            username: pick.username,
            total_earnings: 0,
          };
        }
        acc[userId].total_earnings += earnings;
        return acc;
      }, {});

      const results = Object.values(userEarnings).sort(
        (a: any, b: any) => b.total_earnings - a.total_earnings
      );

      setEventResults((prev) => ({
        ...prev,
        [eventId]: results as EventResult[],
      }));
    } catch (error) {
      console.error('Error fetching event results:', error);
    }
  };

  if (loading) {
    return <div className="text-center text-slate-400 py-8">Loading standings...</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Season Standings */}
      <div className="bg-slate-900/50 backdrop-blur-sm border border-emerald-500/20 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-emerald-500/20 bg-gradient-to-r from-emerald-600/20 to-transparent">
          <h3 className="text-2xl font-bold text-emerald-400" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            Season Standings
          </h3>
          <p className="text-slate-400 text-sm mt-1">Total Prize Money - 2026 Season</p>
        </div>

        <div className="p-6">
          <div className="space-y-3">
            {seasonStandings.map((standing, idx) => (
              <div
                key={standing.user_id}
                className={`p-4 rounded-lg border transition-all ${
                  idx === 0
                    ? 'bg-gradient-to-r from-yellow-600/20 to-yellow-600/5 border-yellow-500/50 shadow-lg shadow-yellow-600/10'
                    : idx === 1
                    ? 'bg-gradient-to-r from-slate-400/20 to-slate-400/5 border-slate-500/50'
                    : idx === 2
                    ? 'bg-gradient-to-r from-orange-600/20 to-orange-600/5 border-orange-500/50'
                    : 'bg-slate-800/30 border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                        idx === 0
                          ? 'bg-yellow-500/20 text-yellow-400 border-2 border-yellow-500'
                          : idx === 1
                          ? 'bg-slate-400/20 text-slate-300 border-2 border-slate-400'
                          : idx === 2
                          ? 'bg-orange-500/20 text-orange-400 border-2 border-orange-500'
                          : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <div>
                      <div className="font-bold text-white text-lg">{standing.username}</div>
                      <div className="text-emerald-400 font-medium text-sm">
                        ${standing.total_winnings.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  {idx === 0 && (
                    <svg className="w-8 h-8 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  )}
                </div>
              </div>
            ))}
          </div>

          {seasonStandings.length === 0 && (
            <div className="text-center text-slate-400 py-8">
              No standings yet - complete some tournaments!
            </div>
          )}
        </div>
      </div>

      {/* Event-by-Event Results */}
      <div className="bg-slate-900/50 backdrop-blur-sm border border-emerald-500/20 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-emerald-500/20">
          <h3 className="text-2xl font-bold text-emerald-400 mb-4" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            Event Results
          </h3>
          
          <select
            value={selectedEvent}
            onChange={(e) => setSelectedEvent(e.target.value)}
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500 transition-colors"
          >
            <option value="">Select an event</option>
            {events.map((event) => (
              <option key={event.event_id} value={event.event_id}>
                {event.event_name}
              </option>
            ))}
          </select>
        </div>

        <div className="p-6">
          {selectedEvent && eventResults[selectedEvent] ? (
            <div className="space-y-2">
              {eventResults[selectedEvent].map((result, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-slate-800/30 border border-slate-700 rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-slate-400 font-medium text-sm">
                        {idx + 1}
                      </span>
                      <span className="font-medium text-white">{result.username}</span>
                    </div>
                    <span className="text-emerald-400 font-medium">
                      ${result.total_earnings.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-slate-400 py-8">
              {selectedEvent ? 'Loading event results...' : 'Select an event to view results'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
