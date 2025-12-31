import React, { useState, useEffect, useRef } from 'react';
import { supabase, LotteryWinner, PRIZE_CATEGORIES, formatLotteryNumber } from '../lib/supabase';
import { 
  Trophy,
  Award,
  Sparkles,
  Star,
  Coins
} from 'lucide-react';
import confetti from 'canvas-confetti';

const PublicWinners: React.FC = () => {
  const [winners, setWinners] = useState<LotteryWinner[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastWinner, setLastWinner] = useState<LotteryWinner | null>(null);
  const previousLastWinnerRef = useRef<string | null>(null);
  const confettiIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Initial fetch
    fetchWinners(true);
    
    // Set up real-time subscription for new winners and updates
    const channel = supabase
      .channel('lottery_winners_changes', {
        config: {
          broadcast: { self: true },
          presence: { key: '' }
        }
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'lottery_winners'
        },
        async (payload) => {
          console.log('🆕 New winner registered:', payload.new);
          // Force immediate refresh of all data
          await fetchWinners(false);
          // Trigger fireworks for new winner
          triggerFireworks();
          console.log('✅ Page updated with new winner data');
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'lottery_winners'
        },
        async (payload) => {
          console.log('🔄 Winner updated:', payload.new);
          // Force immediate refresh of all data
          await fetchWinners(false);
          console.log('✅ Page updated with winner changes');
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'lottery_winners'
        },
        async () => {
          console.log('🗑️ Winner deleted');
          // Force immediate refresh of all data
          await fetchWinners(false);
          console.log('✅ Page updated after winner deletion');
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time subscription ACTIVE - Page will auto-update on database changes');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Real-time subscription error:', err);
          // Attempt to resubscribe after a delay
          setTimeout(() => {
            console.log('🔄 Attempting to reconnect real-time subscription...');
            fetchWinners(false);
          }, 3000);
        } else if (status === 'TIMED_OUT') {
          console.warn('⏱️ Real-time subscription timed out, reconnecting...');
          setTimeout(() => {
            fetchWinners(false);
          }, 2000);
        } else {
          console.log('📡 Real-time subscription status:', status);
        }
      });

    // Backup: Periodic refresh every 10 seconds to ensure data is always current
    // This acts as a safety net in case real-time subscription has issues
    const refreshInterval = setInterval(() => {
      console.log('🔄 Periodic refresh check...');
      fetchWinners(false);
    }, 10000); // Refresh every 10 seconds

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up real-time subscription and intervals');
      supabase.removeChannel(channel);
      clearInterval(refreshInterval);
      if (confettiIntervalRef.current) {
        clearInterval(confettiIntervalRef.current);
      }
    };
  }, []);

  // Trigger fireworks when last winner changes
  useEffect(() => {
    if (lastWinner && lastWinner.id !== previousLastWinnerRef.current) {
      previousLastWinnerRef.current = lastWinner.id;
      triggerFireworks();
      startContinuousFireworks();
    }
  }, [lastWinner]);

  const triggerFireworks = () => {
    const duration = 5000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    // Initial burst
    confetti({
      ...defaults,
      particleCount: 100,
      origin: { x: 0.5, y: 0.5 },
      colors: ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
    });

    const interval: NodeJS.Timeout = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        colors: ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444']
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        colors: ['#8b5cf6', '#ec4899', '#06b6d4', '#f97316']
      });
    }, 250);
  };

  const startContinuousFireworks = () => {
    // Clear any existing interval
    if (confettiIntervalRef.current) {
      clearInterval(confettiIntervalRef.current);
    }

    // Continuous subtle fireworks for last winner section
    confettiIntervalRef.current = setInterval(() => {
      const defaults = { startVelocity: 25, spread: 360, ticks: 50, zIndex: 9999 };
      
      // Multiple small bursts
      confetti({
        ...defaults,
        particleCount: 5,
        origin: { x: 0.3, y: 0.2 },
        colors: ['#22c55e', '#3b82f6']
      });
      confetti({
        ...defaults,
        particleCount: 5,
        origin: { x: 0.7, y: 0.2 },
        colors: ['#f59e0b', '#ef4444']
      });
      confetti({
        ...defaults,
        particleCount: 3,
        origin: { x: 0.5, y: 0.15 },
        colors: ['#8b5cf6', '#ec4899']
      });
    }, 3000);
  };

  const fetchWinners = async (showLoading: boolean = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      
      // Fetch all winners with pagination
      let allWinners: LotteryWinner[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: winnersPage, error } = await supabase
          .from('lottery_winners')
          .select(`
            *,
            ticket:ticket_sales(*)
          `)
          .order('registered_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) throw error;

        if (winnersPage && winnersPage.length > 0) {
          allWinners = [...allWinners, ...winnersPage];
          from += pageSize;
          hasMore = winnersPage.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      // Force state updates - ensure React re-renders with new data
      setWinners([...allWinners]); // Create new array reference to force update
      
      // Set last winner - this will trigger the fireworks effect if it's a new winner
      if (allWinners.length > 0) {
        const newLastWinner = allWinners[0];
        // Always update lastWinner to ensure UI refreshes
        setLastWinner({ ...newLastWinner }); // Create new object reference
      } else {
        setLastWinner(null);
      }

      console.log(`📊 Fetched ${allWinners.length} winners - Page will update`);
    } catch (error) {
      console.error('❌ Error fetching winners:', error);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const getWinnersByCategory = (category: string) => {
    return winners.filter(w => w.prize_category === category);
  };

  const getRemainingQuantity = (categoryName: string) => {
    const category = PRIZE_CATEGORIES.find(p => p.name === categoryName);
    if (!category) return 0;
    const used = getWinnersByCategory(categoryName).length;
    return category.quantity - used;
  };


  const patternUrl = "data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E";

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-red-900 to-black flex items-center justify-center relative overflow-hidden">
        <div 
          className="absolute inset-0 opacity-20"
          style={{ backgroundImage: `url("${patternUrl}")` }}
        ></div>
        <div className="text-center relative z-10">
          <div className="relative">
            <div className="animate-spin rounded-full h-20 w-20 border-4 border-yellow-400 border-t-transparent mx-auto mb-4 shadow-[0_0_20px_rgba(250,204,21,0.5)]"></div>
            <div className="absolute inset-0 animate-ping rounded-full h-20 w-20 border-4 border-yellow-400 opacity-20"></div>
          </div>
          <p className="text-yellow-400 text-xl font-bold tracking-wider animate-pulse">LOADING WINNERS...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-red-900 to-black relative overflow-hidden">
      {/* Animated Background Pattern */}
      <div 
        className="fixed inset-0 opacity-30"
        style={{ backgroundImage: `url("${patternUrl}")` }}
      ></div>
      
      {/* Floating Casino Chips Animation */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="absolute animate-float"
            style={{
              left: `${20 + i * 15}%`,
              top: `${10 + i * 10}%`,
              animationDelay: `${i * 0.5}s`,
              animationDuration: `${3 + i}s`
            }}
          >
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 border-4 border-yellow-300 shadow-[0_0_20px_rgba(250,204,21,0.5)] flex items-center justify-center">
              <Coins className="h-8 w-8 text-yellow-900" />
            </div>
          </div>
        ))}
      </div>

      <div className="w-full px-1 sm:px-2 py-2 sm:py-4 relative z-10">
        {/* Casino Style Header */}
        <div className="text-center mb-2 sm:mb-4 relative">
          {/* Neon Glow Effect */}
          <div className="absolute inset-0 blur-3xl bg-yellow-400 opacity-20 animate-pulse"></div>
          
          <p className="text-xl md:text-2xl font-bold text-yellow-200 mb-3 tracking-wider relative z-10 drop-shadow-[0_0_10px_rgba(250,204,21,0.8)]">
            SHRI SHYAM SANWALIYA CHARITABLE TRUST, DHARGAON
          </p>
          
          <div className="relative z-10">
            <h1 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-200 to-yellow-400 mb-4 tracking-tight drop-shadow-[0_0_20px_rgba(250,204,21,0.9)] animate-pulse">
              LOTTERY WINNERS
            </h1>
            
            {/* Decorative Lines */}
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="h-1 w-24 bg-gradient-to-r from-transparent via-yellow-300 to-yellow-300"></div>
              <Star className="h-6 w-6 text-yellow-300 animate-spin" style={{ animationDuration: '3s' }} />
              <div className="h-1 w-24 bg-gradient-to-l from-transparent via-yellow-300 to-yellow-300"></div>
            </div>
          </div>
        </div>

        {/* Last Winner - Casino Jackpot Style */}
        {lastWinner && (
          <div className="mb-2 sm:mb-4 relative w-full">
            {/* Glowing Border Effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-yellow-400 via-red-500 to-yellow-400 rounded-xl blur opacity-75 animate-pulse"></div>
            
            <div className="relative bg-gradient-to-br from-gray-800 via-gray-900 to-black rounded-lg sm:rounded-xl border-4 border-yellow-400 shadow-[0_0_40px_rgba(250,204,21,0.6)] p-2 sm:p-4 md:p-6 w-full">
              {/* Sparkle Effects */}
              <div className="absolute top-2 right-2 sm:top-4 sm:right-4">
                <Sparkles className="h-6 w-6 sm:h-8 sm:w-8 text-yellow-400 animate-pulse" />
              </div>
              
              <div className="text-center mb-2 sm:mb-4">
                <div className="inline-flex items-center gap-2 sm:gap-3 bg-yellow-400 px-3 sm:px-4 md:px-6 py-1.5 sm:py-2 md:py-3 rounded-full shadow-[0_0_20px_rgba(250,204,21,0.8)]">
                  <Trophy className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 text-yellow-900 animate-bounce" />
                  <span className="text-base sm:text-lg md:text-xl lg:text-2xl font-black text-yellow-900 tracking-wider">JACKPOT WINNER</span>
                  <Trophy className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 text-yellow-900 animate-bounce" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3 md:gap-4 mb-2 sm:mb-4">
                {/* Lottery Number - Casino Style */}
                <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-lg p-2 sm:p-3 md:p-4 border-2 border-yellow-300 shadow-[0_0_20px_rgba(250,204,21,0.5)] transform hover:scale-105 transition-transform">
                  <p className="text-yellow-900 font-bold text-xs mb-1 sm:mb-2 tracking-wider">LOTTERY NUMBER</p>
                  <p className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-black text-yellow-900 font-mono tracking-wider">
                    {formatLotteryNumber(lastWinner.lottery_number)}
                  </p>
                </div>

                {/* Winner Name */}
                <div className="bg-gradient-to-br from-red-600 to-red-700 rounded-lg p-2 sm:p-3 md:p-4 border-2 border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.5)] transform hover:scale-105 transition-transform">
                  <p className="text-red-50 font-bold text-xs mb-1 sm:mb-2 tracking-wider">WINNER NAME</p>
                  <p className="text-base sm:text-lg md:text-xl lg:text-2xl font-black text-white break-words">{lastWinner.winner_name.toUpperCase()}</p>
                </div>

                {/* Prize Won */}
                <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-lg p-2 sm:p-3 md:p-4 border-2 border-green-400 shadow-[0_0_20px_rgba(34,197,94,0.5)] transform hover:scale-105 transition-transform">
                  <p className="text-green-50 font-bold text-xs mb-1 sm:mb-2 tracking-wider">PRIZE WON</p>
                  <p className="text-base sm:text-lg md:text-xl lg:text-2xl font-black text-white break-words">{lastWinner.prize_category.toUpperCase()}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3 md:gap-4">
                <div className="bg-gray-800 rounded-lg p-2 sm:p-3 border-2 border-gray-600">
                  <p className="text-yellow-300 font-bold text-xs mb-1 tracking-wider">CONTACT</p>
                  <p className="font-mono text-white text-xs sm:text-sm md:text-base lg:text-lg break-all">{lastWinner.winner_contact}</p>
                </div>
                {lastWinner.winner_address && (
                  <div className="bg-gray-800 rounded-lg p-2 sm:p-3 border-2 border-gray-600">
                    <p className="text-yellow-300 font-bold text-xs mb-1 tracking-wider">ADDRESS</p>
                    <p className="text-white text-xs sm:text-sm md:text-base break-words">{lastWinner.winner_address}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Prize Categories - Casino Table Style */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 md:gap-4 w-full">
          {PRIZE_CATEGORIES.map((category, index) => {
            const categoryWinners = getWinnersByCategory(category.name);
            const remaining = getRemainingQuantity(category.name);
            const colors = [
              { bgFrom: '#ca8a04', bgTo: '#a16207', border: '#facc15', shadow: 'rgba(250,204,21,0.5)', icon: 'text-yellow-300' },
              { bgFrom: '#dc2626', bgTo: '#b91c1c', border: '#f87171', shadow: 'rgba(239,68,68,0.5)', icon: 'text-red-300' },
              { bgFrom: '#16a34a', bgTo: '#15803d', border: '#4ade80', shadow: 'rgba(34,197,94,0.5)', icon: 'text-green-300' },
              { bgFrom: '#2563eb', bgTo: '#1d4ed8', border: '#60a5fa', shadow: 'rgba(59,130,246,0.5)', icon: 'text-blue-300' },
              { bgFrom: '#9333ea', bgTo: '#7e22ce', border: '#a78bfa', shadow: 'rgba(168,85,247,0.5)', icon: 'text-purple-300' },
            ];
            const colorScheme = colors[index % colors.length];

            return (
              <div key={category.name} className="relative group">
                {/* Glow Effect */}
                <div 
                  className="absolute -inset-0.5 rounded-xl blur opacity-50 group-hover:opacity-75 transition-opacity"
                  style={{
                    background: `linear-gradient(to right, ${colorScheme.bgFrom}, ${colorScheme.bgTo})`
                  }}
                ></div>
                
                <div 
                  className="relative bg-gradient-to-br from-gray-800 via-gray-900 to-black rounded-lg border-2 p-2 sm:p-3 md:p-4 w-full"
                  style={{
                    borderColor: colorScheme.border,
                    boxShadow: `0 0 30px ${colorScheme.shadow}`
                  }}
                >
                  {/* Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2 sm:mb-3 md:mb-4 pb-2 sm:pb-3 border-b-2 border-gray-700 gap-2 sm:gap-0">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <Award className={`h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7 ${colorScheme.icon}`} />
                      <h3 className="text-sm sm:text-base md:text-lg font-black text-white tracking-wider break-words">
                        {category.name.toUpperCase()}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <div className="bg-yellow-500 px-2 py-1 rounded-full border border-yellow-600">
                        <span className="text-yellow-950 font-black text-xs">
                          {categoryWinners.length}/{category.quantity} WON
                        </span>
                      </div>
                      <div className={`px-2 py-1 rounded-full border ${remaining > 0 ? 'bg-green-500 border-green-600' : 'bg-red-500 border-red-600'}`}>
                        <span className={`font-black text-xs ${remaining > 0 ? 'text-green-950' : 'text-red-950'}`}>
                          {remaining} LEFT
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Winners Table - Casino Style - No Scrolling */}
                  {categoryWinners.length > 0 ? (
                    <div className="w-full">
                      <table className="w-full table-auto">
                        <thead>
                          <tr className="border-b-2 border-gray-700">
                            <th className="text-left py-1 sm:py-2 px-1 sm:px-2 text-yellow-300 font-bold text-xs tracking-wider">LOTTERY #</th>
                            <th className="text-left py-1 sm:py-2 px-1 sm:px-2 text-yellow-300 font-bold text-xs tracking-wider">WINNER</th>
                            <th className="text-left py-1 sm:py-2 px-1 sm:px-2 text-yellow-300 font-bold text-xs tracking-wider hidden sm:table-cell">CONTACT</th>
                            <th className="text-left py-1 sm:py-2 px-1 sm:px-2 text-yellow-300 font-bold text-xs tracking-wider hidden md:table-cell">ADDRESS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categoryWinners.map((winner, idx) => (
                            <tr 
                              key={winner.id} 
                              className={`border-b border-gray-800 hover:bg-gray-800 transition-colors ${idx % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-900/30'}`}
                            >
                              <td className="py-1 sm:py-1.5 px-1 sm:px-2">
                                <span className="font-mono font-bold text-yellow-300 text-xs">
                                  {formatLotteryNumber(winner.lottery_number)}
                                </span>
                              </td>
                              <td className="py-1 sm:py-1.5 px-1 sm:px-2">
                                <span className="text-white font-semibold text-xs break-words">{winner.winner_name}</span>
                              </td>
                              <td className="py-1 sm:py-1.5 px-1 sm:px-2 hidden sm:table-cell">
                                <span className="font-mono text-gray-200 text-xs break-all">{winner.winner_contact}</span>
                              </td>
                              <td className="py-1 sm:py-1.5 px-1 sm:px-2 hidden md:table-cell">
                                <span className="text-gray-300 text-xs break-words">
                                  {winner.winner_address || <span className="italic text-gray-400">No address</span>}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-4 sm:py-6">
                      <div className="inline-block bg-gray-800 rounded-full p-3 sm:p-4 border-2 border-gray-700">
                        <p className="text-gray-300 font-bold tracking-wider text-xs sm:text-sm">NO WINNERS YET</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer - Casino Style */}
        <div className="text-center mt-4 sm:mt-6 mb-2 sm:mb-4 relative">
          <div className="inline-block bg-gradient-to-r from-yellow-500 to-yellow-600 px-3 sm:px-4 md:px-6 py-2 sm:py-3 rounded-full border-2 border-yellow-300 shadow-[0_0_20px_rgba(250,204,21,0.5)]">
            <p className="text-yellow-950 font-black text-xs sm:text-sm md:text-base tracking-wider">
              TOTAL WINNERS: {winners.length}
            </p>
            <p className="text-yellow-900 text-xs mt-1 font-semibold">
              Last Updated: {new Date().toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      </div>

      {/* Custom Styles */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(180deg); }
        }
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(to bottom, #fbbf24, #f59e0b);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(to bottom, #fcd34d, #fbbf24);
        }
      `}</style>
    </div>
  );
};

export default PublicWinners;

