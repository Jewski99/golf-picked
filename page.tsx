'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import EventSelector from '@/components/EventSelector';
import DraftRoom from '@/components/DraftRoom';
import Leaderboard from '@/components/Leaderboard';
import Standings from '@/components/Standings';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Home() {
  const [activeTab, setActiveTab] = useState('draft');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentEvent, setCurrentEvent] = useState<any>(null);

  useEffect(() => {
    // Check for current user session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-emerald-950 flex items-center justify-center p-4">
        <div className="bg-slate-800/50 backdrop-blur-sm border border-emerald-500/20 rounded-2xl p-8 max-w-md w-full shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-emerald-400 mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              GOLF PICK'EM
            </h1>
            <p className="text-slate-300 text-sm">2026 PGA Tour Season</p>
          </div>
          <Auth />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-emerald-950">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-sm border-b border-emerald-500/20 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-emerald-400" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                GOLF PICK'EM
              </h1>
              <p className="text-slate-400 text-xs">2026 PGA Tour Season</p>
            </div>
            <button
              onClick={() => supabase.auth.signOut()}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Event Selector */}
      <div className="container mx-auto px-4 py-6">
        <EventSelector onEventSelect={setCurrentEvent} />
      </div>

      {/* Navigation Tabs */}
      <div className="container mx-auto px-4 mb-6">
        <div className="flex gap-2 bg-slate-900/50 p-1 rounded-xl border border-emerald-500/20">
          {['draft', 'leaderboard', 'standings'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                activeTab === tab
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 pb-8">
        {activeTab === 'draft' && <DraftRoom currentEvent={currentEvent} currentUser={currentUser} />}
        {activeTab === 'leaderboard' && <Leaderboard currentEvent={currentEvent} />}
        {activeTab === 'standings' && <Standings />}
      </div>
    </div>
  );
}

function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage('Check your email for the confirmation link!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleAuth} className="space-y-4">
      <div>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
          required
        />
      </div>
      <div>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
          required
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
      >
        {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
      </button>
      <button
        type="button"
        onClick={() => setIsSignUp(!isSignUp)}
        className="w-full text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
      >
        {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
      </button>
      {message && (
        <p className={`text-sm text-center ${message.includes('Check') ? 'text-emerald-400' : 'text-red-400'}`}>
          {message}
        </p>
      )}
    </form>
  );
}
