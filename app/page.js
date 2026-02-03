'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

export default function Home() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('draft');
  const [currentEvent, setCurrentEvent] = useState(null);
  const [events, setEvents] = useState([]);
  const [players, setPlayers] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [draftPicks, setDraftPicks] = useState([]);
  const [draftOrder, setDraftOrder] = useState([]);
  const [seasonStandings, setSeasonStandings] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerStats, setPlayerStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerStats, setPlayerStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      fetchEvents();
      fetchStandings();
    }
  }, [user]);

  useEffect(() => {
    if (currentEvent) {
      fetchPlayers();
      fetchDraftPicks();
      fetchDraftOrder();
      fetchLeaderboard();
      
      const interval = setInterval(() => {
        fetchLeaderboard();
      }, 120000);
      
      return () => clearInterval(interval);
    }
  }, [currentEvent]);

  const fetchEvents = async () => {
    try {
      const response = await fetch(
        `https://use.livegolfapi.com/v1/events?api_key=${process.env.NEXT_PUBLIC_LIVEGOLF_API_KEY}&tour=pga-tour`
      );
      const data = await response.json();
      const now = new Date();
      
      // Filter events - include current and upcoming
      const relevantEvents = data.filter(e => {
        const endDate = new Date(e.endDatetime);
        return endDate >= now;
      });
      
      setEvents(relevantEvents);
      
      if (relevantEvents.length > 0) {
        let selectedEvent = relevantEvents[0];
        
        for (const event of relevantEvents) {
          const startDate = new Date(event.startDatetime);
          const endDate = new Date(event.endDatetime);
          
          // If tournament is currently happening (between start and end), show it
          if (now >= startDate && now <= endDate) {
            selectedEvent = event;
            break;
          }
          
          // If tournament hasn't started yet, this is the next one
          if (now < startDate) {
            selectedEvent = event;
            break;
          }
        }
        
        setCurrentEvent(selectedEvent);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  };

  const fetchPlayers = async () => {
    try {
      const response = await fetch(
        `https://use.livegolfapi.com/v1/events/${currentEvent.id}/players?api_key=${process.env.NEXT_PUBLIC_LIVEGOLF_API_KEY}`
      );
      const data = await response.json();
      setPlayers(data);
    } catch (error) {
      console.error('Error fetching players:', error);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch(
        `https://use.livegolfapi.com/v1/events/${currentEvent.id}/leaderboard?api_key=${process.env.NEXT_PUBLIC_LIVEGOLF_API_KEY}`
      );
      const data = await response.json();
      setLeaderboard(data);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    }
  };

  const fetchDraftPicks = async () => {
    const { data } = await supabase
      .from('draft_picks')
      .select('*')
      .eq('event_id', currentEvent.id)
      .order('pick_number');
    
    const previousPickCount = draftPicks.length;
    setDraftPicks(data || []);
    
    // If picks increased, check if we need to notify next person
    if (data && data.length > previousPickCount && data.length < draftOrder.length * 4) {
      const nextPickIndex = data.length % draftOrder.length;
      const nextDrafter = draftOrder[nextPickIndex];
      
      if (nextDrafter && nextDrafter.user_id !== user.id) {
        // Send notification to next person
        sendNotification(nextDrafter, data.length + 1);
      }
    }
  };

  const sendNotification = async (drafter, pickNumber) => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone_number')
        .eq('id', drafter.user_id)
        .single();

      if (profile?.phone_number) {
        const myPicksCount = draftPicks.filter(p => p.user_id === drafter.user_id).length;
        
        await fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: profile.phone_number,
            username: drafter.username,
            pickNumber: myPicksCount + 1,
            eventName: currentEvent.name,
          }),
        });
      }
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  };

  const fetchDraftOrder = async () => {
    const { data } = await supabase
      .from('season_standings')
      .select('*')
      .order('total_winnings', { ascending: true });
    setDraftOrder(data || []);
  };

  const fetchStandings = async () => {
    const { data } = await supabase
      .from('season_standings')
      .select('*')
      .order('total_winnings', { ascending: false });
    setSeasonStandings(data || []);
  };

  const fetchPlayerStats = async (player) => {
    setSelectedPlayer(player);
    setLoadingStats(true);
    
    try {
      // Fetch player's tournament results from LiveGolf API
      const response = await fetch(
        `https://use.livegolfapi.com/v1/players/${player.id}/results?api_key=${process.env.NEXT_PUBLIC_LIVEGOLF_API_KEY}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch player stats');
      }
      
      const results = await response.json();
      
      // Get last 5 tournaments
      const recentResults = results.slice(0, 5);
      
      // Calculate season earnings (all results)
      const seasonEarnings = results.reduce((sum, r) => sum + (r.earnings || 0), 0);
      
      // Find best finish
      let bestFinish = null;
      results.forEach(r => {
        if (r.position && r.position !== 'CUT') {
          const pos = parseInt(r.position.replace(/\D/g, ''));
          if (!bestFinish || pos < bestFinish) {
            bestFinish = pos;
          }
        }
      });
      
      // Get times drafted in this league
      const { data: draftData } = await supabase
        .from('draft_picks')
        .select('*')
        .eq('player_id', player.id);
      
      setPlayerStats({
        recentResults,
        seasonEarnings,
        bestFinish: bestFinish || 'N/A',
        timesDrafted: draftData?.length || 0
      });
      
    } catch (error) {
      console.error('Error fetching player stats:', error);
      setPlayerStats({ error: true });
    } finally {
      setLoadingStats(false);
    }
  };

  const closePlayerModal = () => {
    setSelectedPlayer(null);
    setPlayerStats(null);
  };

  const fetchPlayerStats = async (player) => {
    setSelectedPlayer(player);
    setLoadingStats(true);
    
    try {
      // Fetch player's recent tournament history
      const response = await fetch(
        `https://use.livegolfapi.com/v1/players/${player.id}/results?api_key=${process.env.NEXT_PUBLIC_LIVEGOLF_API_KEY}`
      );
      const data = await response.json();
      
      // Calculate stats
      const recentResults = data.slice(0, 5); // Last 5 tournaments
      const seasonEarnings = data.reduce((sum, result) => sum + (result.earnings || 0), 0);
      const bestFinish = data.reduce((best, result) => {
        const pos = parseInt(result.position);
        return pos < best ? pos : best;
      }, 999);
      
      // Get how many times drafted in league
      const { data: draftData } = await supabase
        .from('draft_picks')
        .select('*')
        .eq('player_id', player.id);
      
      setPlayerStats({
        recentResults,
        seasonEarnings,
        bestFinish: bestFinish === 999 ? 'N/A' : bestFinish,
        timesDrafted: draftData?.length || 0,
        leagueEarnings: draftData?.reduce((sum, pick) => {
          // Calculate earnings from this league
          return sum;
        }, 0) || 0
      });
    } catch (error) {
      console.error('Error fetching player stats:', error);
      setPlayerStats(null);
    } finally {
      setLoadingStats(false);
    }
  };

  const closePlayerModal = () => {
    setSelectedPlayer(null);
    setPlayerStats(null);
  };

  const draftPlayer = async (player) => {
    const myPicks = draftPicks.filter(p => p.user_id === user.id);
    if (myPicks.length >= 4) return;

    const currentPickNum = draftPicks.length + 1;
    const pickIndex = (currentPickNum - 1) % draftOrder.length;
    const currentDrafter = draftOrder[pickIndex];
    
    if (currentDrafter?.user_id !== user.id) return;

    await supabase.from('draft_picks').insert({
      event_id: currentEvent.id,
      event_name: currentEvent.name,
      user_id: user.id,
      username: user.email.split('@')[0],
      player_id: player.id,
      player_name: player.name,
      pick_number: currentPickNum,
    });

    fetchDraftPicks();
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#10b981', fontSize: '20px' }}>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm supabase={supabase} />;
  }

  const availablePlayers = players.filter(
    p => !draftPicks.some(pick => pick.player_id === p.id)
  );
  
  const filteredPlayers = availablePlayers.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const draftedPlayerIds = new Set(draftPicks.map(p => p.player_id));
  const filteredLeaderboard = leaderboard.filter(entry => draftedPlayerIds.has(entry.player?.id));

  const myPicks = draftPicks.filter(p => p.user_id === user.id);
  const currentPickNum = draftPicks.length + 1;
  const pickIndex = (currentPickNum - 1) % draftOrder.length;
  const currentDrafter = draftOrder[pickIndex];
  const isMyTurn = currentDrafter?.user_id === user.id && myPicks.length < 4;
  const isDraftComplete = draftPicks.length >= draftOrder.length * 4;

  return (
    <div style={{ minHeight: '100vh', background: '#1e293b', color: '#ffffff' }}>
      {/* Header */}
      <header style={{ background: '#0f172a', borderBottom: '1px solid #334155', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '12px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>
                Golf Pick&apos;em League
              </h1>
              <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>2026 PGA Tour Season</p>
            </div>
            <button
              onClick={() => supabase.auth.signOut()}
              style={{
                padding: '8px 16px',
                background: '#334155',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Event Selector */}
      {currentEvent && (
        <div style={{ maxWidth: '1200px', margin: '16px auto', padding: '0 16px' }}>
          <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 'bold', color: '#ffffff' }}>
              {currentEvent.name}
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '14px', color: '#ffffff' }}>
              <span>📍 {currentEvent.location}</span>
              <span>⛳ {currentEvent.course}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ maxWidth: '1200px', margin: '16px auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', gap: '8px', background: '#0f172a', padding: '4px', borderRadius: '8px', border: '1px solid #334155' }}>
          {['draft', 'field', 'leaderboard', 'standings'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: '10px 12px',
                background: activeTab === tab ? '#10b981' : 'transparent',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: activeTab === tab ? 'bold' : 'normal',
                fontSize: '14px'
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 16px 32px' }}>
        {activeTab === 'field' && (
          <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-slate-700">
              <h3 className="text-xl font-bold text-white">{currentEvent?.name} Field</h3>
              <p className="text-slate-400 text-sm mt-1">
                {players.length} players in the field
              </p>
            </div>
            <div style={{ padding: '16px' }}>
              <input
                type="text"
                placeholder="Search field..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  marginBottom: '16px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '14px'
                }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px', maxHeight: '700px', overflowY: 'auto' }}>
                {players
                  .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((player, idx) => {
                    const isDrafted = draftPicks.some(pick => pick.player_id === player.id);
                    return (
                      <button
                        key={player.id}
                        onClick={() => fetchPlayerStats(player)}
                        style={{
                          padding: '12px',
                          background: isDrafted ? '#1e293b50' : '#1e293b',
                          border: `1px solid ${isDrafted ? '#64748b' : '#334155'}`,
                          borderRadius: '8px',
                          opacity: isDrafted ? 0.6 : 1,
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#065f4620';
                          e.currentTarget.style.borderColor = '#10b981';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = isDrafted ? '#1e293b50' : '#1e293b';
                          e.currentTarget.style.borderColor = isDrafted ? '#64748b' : '#334155';
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '4px' }}>
                          <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '15px' }}>{player.name}</div>
                          {isDrafted ? (
                            <span style={{ fontSize: '16px' }}>✓</span>
                          ) : (
                            <span style={{ fontSize: '14px', color: '#10b981' }}>→</span>
                          )}
                        </div>
                        <div style={{ fontSize: '13px', color: '#94a3b8' }}>{player.country}</div>
                        {isDrafted && (
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Drafted</div>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'draft' && (
          <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth >= 1024 ? '1fr 2fr' : '1fr', gap: '16px' }}>
            {/* Draft Order & My Picks Column */}
            <div>
              {/* Draft History Feed */}
              <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 'bold', color: '#ffffff' }}>
                  Draft Feed {draftPicks.length > 0 && `(${draftPicks.length}/${draftOrder.length * 4})`}
                </h3>
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {draftPicks.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '14px' }}>
                      Draft hasn&apos;t started yet
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column-reverse' }}>
                      {draftPicks.slice().reverse().map((pick, idx) => (
                        <div
                          key={pick.id}
                          style={{
                            padding: '10px 12px',
                            marginBottom: '8px',
                            background: idx === 0 ? '#065f4615' : '#1e293b',
                            border: `1px solid ${idx === 0 ? '#10b981' : '#334155'}`,
                            borderRadius: '6px',
                            borderLeft: idx === 0 ? '3px solid #10b981' : '1px solid #334155'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 700, letterSpacing: '0.5px' }}>
                              PICK #{pick.pick_number}
                            </span>
                            {idx === 0 && (
                              <span style={{ fontSize: '10px', background: '#10b981', color: '#ffffff', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                LATEST
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '15px', color: '#ffffff', fontWeight: 600, marginBottom: '4px' }}>
                            {pick.player_name}
                          </div>
                          <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                            drafted by <span style={{ color: '#10b981', fontWeight: 500 }}>{pick.username}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Draft Order */}
              <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 'bold', color: '#ffffff' }}>Draft Order</h3>
                {draftOrder.map((drafter, idx) => {
                  const picks = draftPicks.filter(p => p.user_id === drafter.user_id);
                  const isCurrent = idx === pickIndex && !isDraftComplete;
                  return (
                    <div
                      key={drafter.user_id}
                      style={{
                        padding: '12px',
                        background: isCurrent ? '#065f46' : '#1e293b',
                        border: `1px solid ${isCurrent ? '#10b981' : '#334155'}`,
                        borderRadius: '8px',
                        marginBottom: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 500, color: '#ffffff' }}>{drafter.username}</span>
                        <span style={{ fontSize: '14px', color: '#ffffff' }}>{picks.length}/4</span>
                      </div>
                      {isCurrent && (
                        <div style={{ marginTop: '4px', fontSize: '12px', color: '#10b981', fontWeight: 500 }}>
                          ON THE CLOCK
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* My Picks */}
              <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 'bold', color: '#ffffff' }}>
                  My Picks ({myPicks.length}/4)
                </h3>
                {myPicks.map((pick, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '12px',
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      marginBottom: '8px'
                    }}
                  >
                    <div style={{ fontWeight: 500, color: '#ffffff' }}>{pick.player_name}</div>
                    <div style={{ fontSize: '14px', color: '#94a3b8' }}>Pick #{pick.pick_number}</div>
                  </div>
                ))}
                {[...Array(4 - myPicks.length)].map((_, idx) => (
                  <div
                    key={`empty-${idx}`}
                    style={{
                      padding: '12px',
                      border: '2px dashed #334155',
                      borderRadius: '8px',
                      marginBottom: '8px'
                    }}
                  >
                    <div style={{ color: '#64748b', fontSize: '14px' }}>Empty slot</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Available Players */}
            <div>
              <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#ffffff' }}>Available Players</h3>
                  {isMyTurn && !isDraftComplete && (
                    <span style={{ padding: '4px 12px', background: '#10b981', color: '#ffffff', fontSize: '14px', fontWeight: 500, borderRadius: '20px' }}>
                      Your Turn!
                    </span>
                  )}
                </div>
                <div style={{ position: 'relative', marginBottom: '12px' }}>
                  <input
                    type="text"
                    placeholder="Type player name to search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: '#1e293b',
                      border: searchTerm ? '2px solid #10b981' : '1px solid #334155',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontSize: '16px',
                      outline: 'none'
                    }}
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '18px',
                        padding: '4px'
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '8px' }}>
                  {searchTerm 
                    ? `${filteredPlayers.length} player${filteredPlayers.length !== 1 ? 's' : ''} found`
                    : `${filteredPlayers.length} players available - start typing to search`
                  }
                </div>
                <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                  {searchTerm && filteredPlayers.length === 0 && (
                    <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                      No players found matching "{searchTerm}"
                    </div>
                  )}
                  {filteredPlayers.slice(0, searchTerm ? filteredPlayers.length : 20).map(player => (
                    <button
                      key={player.id}
                      onClick={() => {
                        draftPlayer(player);
                        setSearchTerm('');
                      }}
                      disabled={!isMyTurn || isDraftComplete}
                      style={{
                        width: '100%',
                        padding: '14px 16px',
                        marginBottom: '8px',
                        background: isMyTurn && !isDraftComplete ? (searchTerm ? '#065f4620' : '#1e293b') : '#1e293b80',
                        border: `2px solid ${isMyTurn && !isDraftComplete && searchTerm ? '#10b981' : '#334155'}`,
                        borderRadius: '8px',
                        color: '#ffffff',
                        textAlign: 'left',
                        cursor: isMyTurn && !isDraftComplete ? 'pointer' : 'not-allowed',
                        opacity: isMyTurn && !isDraftComplete ? 1 : 0.5,
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        if (isMyTurn && !isDraftComplete) {
                          e.currentTarget.style.background = '#065f4640';
                          e.currentTarget.style.transform = 'translateX(4px)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (isMyTurn && !isDraftComplete) {
                          e.currentTarget.style.background = searchTerm ? '#065f4620' : '#1e293b';
                          e.currentTarget.style.transform = 'translateX(0)';
                        }
                      }}
                    >
                      <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '16px', marginBottom: '4px' }}>{player.name}</div>
                      <div style={{ fontSize: '14px', color: '#94a3b8' }}>{player.country}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'leaderboard' && (
          <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid #334155' }}>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#ffffff' }}>Live Leaderboard</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#94a3b8' }}>
                Showing {filteredLeaderboard.length} drafted players
              </p>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#1e293b' }}>
                  <tr>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#ffffff', textTransform: 'uppercase' }}>Pos</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#ffffff', textTransform: 'uppercase' }}>Player</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: 500, color: '#ffffff', textTransform: 'uppercase' }}>Score</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontSize: '12px', fontWeight: 500, color: '#ffffff', textTransform: 'uppercase' }}>Earnings</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeaderboard.map((entry, idx) => (
                    <tr key={idx} style={{ borderTop: '1px solid #334155' }}>
                      <td style={{ padding: '12px', color: '#ffffff', fontWeight: 500 }}>{entry.position}</td>
                      <td style={{ padding: '12px', color: '#ffffff', fontWeight: 500 }}>{entry.player?.name}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: entry.score?.total < 0 ? '#f87171' : '#ffffff' }}>
                        {entry.score?.total > 0 ? '+' : ''}{entry.score?.total || 'E'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#10b981', fontWeight: 500 }}>
                        ${entry.earnings?.toLocaleString() || '0'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredLeaderboard.length === 0 && (
              <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                No leaderboard data available yet
              </div>
            )}
          </div>
        )}

        {activeTab === 'standings' && (
          <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: 'bold', color: '#ffffff' }}>Season Standings</h3>
            {seasonStandings.map((standing, idx) => (
              <div
                key={standing.user_id}
                style={{
                  padding: '16px',
                  marginBottom: '12px',
                  background: idx === 0 ? '#78350f40' : '#1e293b',
                  border: `1px solid ${idx === 0 ? '#f59e0b' : '#334155'}`,
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: idx === 0 ? '#f59e0b' : '#334155',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      color: '#ffffff'
                    }}
                  >
                    {idx + 1}
                  </div>
                  <div>
                    <div style={{ fontWeight: 'bold', color: '#ffffff', fontSize: '16px' }}>{standing.username}</div>
                    <div style={{ color: '#10b981', fontWeight: 500, fontSize: '14px' }}>
                      ${standing.total_winnings?.toLocaleString() || '0'}
                    </div>
                  </div>
                </div>
                {idx === 0 && <span style={{ fontSize: '24px' }}>🏆</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Player Stats Modal */}
      {selectedPlayer && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={closePlayerModal}
        >
          <div
            style={{
              background: '#0f172a',
              border: '2px solid #10b981',
              borderRadius: '16px',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ padding: '24px', borderBottom: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: '#ffffff' }}>
                    {selectedPlayer.name}
                  </h2>
                  <p style={{ margin: '6px 0 0 0', fontSize: '16px', color: '#94a3b8' }}>
                    {selectedPlayer.country}
                  </p>
                </div>
                <button
                  onClick={closePlayerModal}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    fontSize: '32px',
                    cursor: 'pointer',
                    padding: 0,
                    lineHeight: '1'
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '24px' }}>
              {loadingStats ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#10b981', fontSize: '16px' }}>
                  Loading stats...
                </div>
              ) : playerStats?.error ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#ef4444', fontSize: '16px' }}>
                  Unable to load player stats
                </div>
              ) : playerStats ? (
                <>
                  {/* Season Summary Cards */}
                  <div style={{ marginBottom: '28px' }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 'bold', color: '#10b981' }}>
                      📊 2026 Season
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div style={{ padding: '16px', background: '#1e293b', border: '1px solid #334155', borderRadius: '10px' }}>
                        <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Season Earnings
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>
                          ${playerStats.seasonEarnings.toLocaleString()}
                        </div>
                      </div>
                      <div style={{ padding: '16px', background: '#1e293b', border: '1px solid #334155', borderRadius: '10px' }}>
                        <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Best Finish
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff' }}>
                          {playerStats.bestFinish === 'N/A' ? 'N/A' : `T${playerStats.bestFinish}`}
                        </div>
                      </div>
                      <div style={{ padding: '16px', background: '#1e293b', border: '1px solid #334155', borderRadius: '10px' }}>
                        <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Times Drafted
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff' }}>
                          {playerStats.timesDrafted}x
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Recent Form */}
                  <div>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 'bold', color: '#10b981' }}>
                      🔥 Recent Form (Last 5 Events)
                    </h3>
                    {playerStats.recentResults.length > 0 ? (
                      <div>
                        {playerStats.recentResults.map((result, idx) => (
                          <div
                            key={idx}
                            style={{
                              padding: '14px',
                              background: '#1e293b',
                              border: '1px solid #334155',
                              borderRadius: '10px',
                              marginBottom: '10px'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '6px' }}>
                              <div style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff', flex: 1, paddingRight: '12px' }}>
                                {result.eventName || 'Tournament'}
                              </div>
                              <div style={{ fontSize: '20px', fontWeight: 'bold', color: result.position ? '#10b981' : '#ef4444', flexShrink: 0 }}>
                                {result.position ? `T${result.position}` : 'CUT'}
                              </div>
                            </div>
                            <div style={{ fontSize: '14px', color: '#10b981', fontWeight: 500 }}>
                              ${(result.earnings || 0).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '40px 20px', background: '#1e293b', border: '1px solid #334155', borderRadius: '10px' }}>
                        <div style={{ color: '#64748b', fontSize: '16px' }}>
                          No recent results available
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AuthForm({ supabase }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage(error.message);
      } else {
        setMessage('Account created! You can now sign in.');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(error.message);
      }
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '16px', padding: '32px', maxWidth: '400px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: 'bold', color: '#10b981' }}>
            Golf Pick&apos;em League
          </h1>
          <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>2026 PGA Tour Season</p>
        </div>

        <form onSubmit={handleAuth}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px',
              marginBottom: '12px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#ffffff',
              fontSize: '14px'
            }}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px',
              marginBottom: '12px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#ffffff',
              fontSize: '14px'
            }}
            required
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '12px',
              background: '#10b981',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 500,
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            style={{
              width: '100%',
              background: 'transparent',
              color: '#10b981',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            {isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
          </button>
        </form>

        {message && (
          <p style={{ marginTop: '16px', textAlign: 'center', fontSize: '14px', color: message.includes('created') ? '#10b981' : '#ef4444' }}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

