import React, { useState, useEffect, useRef } from 'react';
import { supabase, LotteryWinner, PRIZE_CATEGORIES, formatLotteryNumber } from '../lib/supabase';
import { 
  Trophy,
  Award,
  Phone,
  MapPin,
  Search as SearchIcon
} from 'lucide-react';
import confetti from 'canvas-confetti';
import toast from 'react-hot-toast';

const PublicWinners: React.FC = () => {
  const [winners, setWinners] = useState<LotteryWinner[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [lastWinner, setLastWinner] = useState<LotteryWinner | null>(null);
  const [searchedWinner, setSearchedWinner] = useState<LotteryWinner | null>(null);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [searching, setSearching] = useState(false);
  const [contactNumber1, setContactNumber1] = useState(() => {
    const saved = localStorage.getItem('publicWinners_contact1');
    return saved || '+91 9876543210';
  });
  const [contactNumber2, setContactNumber2] = useState(() => {
    const saved = localStorage.getItem('publicWinners_contact2');
    return saved || '+91 9876543211';
  });
  const previousLastWinnerRef = useRef<string | null>(null);
  const confettiIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Save contact numbers to localStorage when changed
  useEffect(() => {
    localStorage.setItem('publicWinners_contact1', contactNumber1);
  }, [contactNumber1]);

  useEffect(() => {
    localStorage.setItem('publicWinners_contact2', contactNumber2);
  }, [contactNumber2]);

  useEffect(() => {
    fetchWinners();
    
    // Set up real-time subscription for new winners
    const channel = supabase
      .channel('lottery_winners_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'lottery_winners'
        },
        (payload) => {
          console.log('New winner registered:', payload.new);
          fetchWinners();
          triggerFireworks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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

  const fetchWinners = async () => {
    try {
      setLoading(true);
      
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

      setWinners(allWinners);
      
      // Set last winner
      if (allWinners.length > 0) {
        setLastWinner(allWinners[0]);
      }
    } catch (error) {
      console.error('Error fetching winners:', error);
    } finally {
      setLoading(false);
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

  const performWinnerSearch = async () => {
    if (!searchTerm.trim()) {
      toast.error('Please enter a lottery number or contact number');
      return;
    }

    try {
      setSearching(true);
      setSearchPerformed(true);
      setSearchedWinner(null);

      // Try to parse as lottery number first
      let lotteryNumber: number | null = null;
      const trimmedSearch = searchTerm.trim();
      
      // Check if it's a 5-digit format (e.g., "00005")
      if (trimmedSearch.length === 5 && /^[0-9]{5}$/.test(trimmedSearch)) {
        lotteryNumber = parseInt(trimmedSearch, 10);
      } else if (/^[0-9]+$/.test(trimmedSearch)) {
        // Regular number format
        lotteryNumber = parseInt(trimmedSearch, 10);
      }

      let query = supabase
        .from('lottery_winners')
        .select('*');

      if (lotteryNumber !== null) {
        query = query.eq('lottery_number', lotteryNumber);
      } else {
        // Search by contact number
        query = query.ilike('winner_contact', `%${trimmedSearch}%`);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;

      if (data) {
        setSearchedWinner(data);
        // Trigger fireworks for winner found
        triggerFireworks();
      } else {
        setSearchedWinner(null);
      }
    } catch (error) {
      console.error('Error searching for winner:', error);
      toast.error('Failed to search. Please try again.');
      setSearchedWinner(null);
    } finally {
      setSearching(false);
    }
  };

  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      performWinnerSearch();
    }
  };

  const filteredWinners = winners.filter(winner => {
    const matchesSearch = 
      formatLotteryNumber(winner.lottery_number).includes(searchTerm) ||
      winner.lottery_number.toString().includes(searchTerm) ||
      winner.winner_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      winner.winner_contact.includes(searchTerm) ||
      winner.prize_category.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = selectedCategory === 'all' || winner.prize_category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-secondary-50 to-success-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary-600 mx-auto mb-4"></div>
          <p className="text-secondary-600">Loading winners...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-secondary-50 to-success-50">
      <div className="container mx-auto px-4 py-8">
        {/* Big Title */}
        <div className="text-center mb-8">
          <h1 className="text-5xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary-600 via-success-600 to-primary-600 mb-4">
            🎉 Lottery Winners 🎉
          </h1>
          <p className="text-lg text-secondary-600 mt-2">
            Check if your lottery number has won a prize!
          </p>
        </div>

        {/* Contact Details for Prize Claiming */}
        <div className="card bg-gradient-to-r from-success-50 to-primary-50 border-2 border-success-300 mb-6">
          <div className="card-content">
            <h3 className="text-xl font-semibold text-secondary-900 mb-4 flex items-center justify-center">
              <Phone className="h-5 w-5 mr-2 text-success-600" />
              Contact for Prize Claiming
            </h3>
            <div className="flex flex-col md:flex-row items-center justify-center gap-6">
              <div className="bg-white rounded-lg p-4 shadow-sm text-center w-full md:w-auto">
                <p className="text-sm text-secondary-600 mb-2">Contact Number 1</p>
                <input
                  type="text"
                  value={contactNumber1}
                  onChange={(e) => setContactNumber1(e.target.value)}
                  className="text-xl font-bold text-primary-600 font-mono text-center bg-transparent border-b-2 border-primary-300 focus:border-primary-600 focus:outline-none w-full"
                  placeholder="Enter contact number 1"
                />
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm text-center w-full md:w-auto">
                <p className="text-sm text-secondary-600 mb-2">Contact Number 2</p>
                <input
                  type="text"
                  value={contactNumber2}
                  onChange={(e) => setContactNumber2(e.target.value)}
                  className="text-xl font-bold text-primary-600 font-mono text-center bg-transparent border-b-2 border-primary-300 focus:border-primary-600 focus:outline-none w-full"
                  placeholder="Enter contact number 2"
                />
              </div>
            </div>
            <p className="text-center text-sm text-secondary-600 mt-4">
              Please contact us with your lottery number and prize details to claim your prize
            </p>
          </div>
        </div>

        {/* Last Winner Section with Continuous Fireworks */}
        {lastWinner && (
          <div className="card bg-gradient-to-r from-success-50 to-primary-50 border-2 border-success-300 mb-6 relative overflow-hidden">
            <div className="card-header">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-secondary-900 flex items-center">
                  <Trophy className="h-5 w-5 mr-2 text-success-600 animate-pulse" />
                  Last Winner
                </h3>
                <span className="badge badge-success animate-pulse">Latest</span>
              </div>
            </div>
            <div className="card-content">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <p className="text-sm text-secondary-600">Lottery Number</p>
                  <p className="text-2xl font-bold text-primary-600 font-mono">
                    {formatLotteryNumber(lastWinner.lottery_number)}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <p className="text-sm text-secondary-600">Winner Name</p>
                  <p className="text-xl font-semibold text-secondary-900">{lastWinner.winner_name}</p>
                </div>
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <p className="text-sm text-secondary-600">Prize Won</p>
                  <p className="text-xl font-semibold text-success-600">{lastWinner.prize_category}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <p className="text-sm text-secondary-600">Contact</p>
                  <p className="font-mono text-secondary-900">{lastWinner.winner_contact}</p>
                </div>
                {lastWinner.winner_address && (
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <p className="text-sm text-secondary-600">Address</p>
                    <p className="text-secondary-900">{lastWinner.winner_address}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Enhanced Search Section */}
        <div className="card bg-gradient-to-r from-primary-50 to-success-50 border-2 border-primary-300 mb-6">
          <div className="card-content">
            <h3 className="text-2xl font-bold text-secondary-900 mb-6 text-center">
              🔍 Check Your Lottery Number
            </h3>
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row gap-4 items-center">
                <div className="flex-1 w-full">
                  <div className="relative">
                    <SearchIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 h-6 w-6 text-secondary-400" />
                    <input
                      type="text"
                      placeholder="Enter your lottery number or contact number..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setSearchPerformed(false);
                        setSearchedWinner(null);
                      }}
                      onKeyPress={handleSearchKeyPress}
                      className="input w-full pl-12 text-lg py-4 border-2 border-primary-300 focus:border-primary-600 focus:ring-2 focus:ring-primary-200"
                    />
                  </div>
                </div>
                <button
                  onClick={performWinnerSearch}
                  disabled={searching || !searchTerm.trim()}
                  className="btn btn-primary text-lg px-8 py-4 font-bold w-full md:w-auto min-w-[150px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {searching ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white inline-block mr-2"></div>
                      Searching...
                    </>
                  ) : (
                    <>
                      <SearchIcon className="h-5 w-5 mr-2" />
                      Search
                    </>
                  )}
                </button>
              </div>

              {/* Search Results */}
              {searchPerformed && (
                <div className="mt-6">
                  {searchedWinner ? (
                    <div className="bg-gradient-to-r from-success-100 to-primary-100 border-2 border-success-400 rounded-lg p-8 text-center animate-pulse">
                      <div className="text-6xl mb-4">🎉🎊🎉</div>
                      <h2 className="text-3xl md:text-4xl font-bold text-success-700 mb-4">
                        Hurray! You Won!
                      </h2>
                      <div className="bg-white rounded-lg p-6 shadow-lg mb-4">
                        <p className="text-xl md:text-2xl font-semibold text-secondary-900 mb-2">
                          Prize: <span className="text-success-600">{searchedWinner.prize_category}</span>
                        </p>
                        <p className="text-lg md:text-xl text-secondary-700">
                          Lottery Number: <span className="font-mono font-bold text-primary-600">{formatLotteryNumber(searchedWinner.lottery_number)}</span>
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-4 shadow-lg">
                        <p className="text-lg font-semibold text-secondary-900 mb-2">
                          📞 Contact on the numbers below to claim your prize:
                        </p>
                        <div className="flex flex-col md:flex-row items-center justify-center gap-4">
                          <p className="text-xl font-bold text-primary-600 font-mono">{contactNumber1}</p>
                          <span className="text-secondary-400">or</span>
                          <p className="text-xl font-bold text-primary-600 font-mono">{contactNumber2}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gradient-to-r from-secondary-100 to-secondary-200 border-2 border-secondary-300 rounded-lg p-8 text-center">
                      <div className="text-6xl mb-4">😔</div>
                      <h2 className="text-3xl md:text-4xl font-bold text-secondary-700 mb-2">
                        Better Luck Next Time
                      </h2>
                      <p className="text-lg text-secondary-600 mt-2">
                        Your lottery number or contact number was not found in the winners list.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Category Filter (below search results) */}
              <div className="mt-6 pt-6 border-t border-secondary-200">
                <label className="block text-sm font-medium text-secondary-700 mb-2">
                  Filter by Prize Category (Optional)
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="input w-full"
                >
                  <option value="all">All Categories</option>
                  {PRIZE_CATEGORIES.map((prize) => {
                    const remaining = getRemainingQuantity(prize.name);
                    return (
                      <option key={prize.name} value={prize.name}>
                        {prize.name} ({getWinnersByCategory(prize.name).length}/{prize.quantity})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Winners by Category */}
        <div className="space-y-6">
          {PRIZE_CATEGORIES.map((category) => {
            const categoryWinners = getWinnersByCategory(category.name);
            const remaining = getRemainingQuantity(category.name);
            
            if (selectedCategory !== 'all' && selectedCategory !== category.name) {
              return null;
            }

            return (
              <div key={category.name} className="card">
                <div className="card-header">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium text-secondary-900">
                      {category.name}
                    </h3>
                    <div className="flex items-center space-x-2">
                      <span className="badge badge-secondary">
                        {categoryWinners.length} / {category.quantity} Won
                      </span>
                      <span className={`badge ${remaining > 0 ? 'badge-success' : 'badge-danger'}`}>
                        {remaining} Remaining
                      </span>
                    </div>
                  </div>
                </div>
                <div className="card-content">
                  {categoryWinners.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="table">
                        <thead className="table-header">
                          <tr>
                            <th className="table-header-cell">Lottery #</th>
                            <th className="table-header-cell">Winner Name</th>
                            <th className="table-header-cell">Contact</th>
                            <th className="table-header-cell">Address</th>
                          </tr>
                        </thead>
                        <tbody className="table-body">
                          {categoryWinners
                            .filter(winner => {
                              if (searchTerm && selectedCategory === 'all') {
                                return formatLotteryNumber(winner.lottery_number).includes(searchTerm) ||
                                       winner.winner_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                       winner.winner_contact.includes(searchTerm);
                              }
                              return true;
                            })
                            .map((winner) => (
                              <tr key={winner.id} className="table-row">
                                <td className="table-cell font-mono font-medium">
                                  {formatLotteryNumber(winner.lottery_number)}
                                </td>
                                <td className="table-cell font-medium">{winner.winner_name}</td>
                                <td className="table-cell font-mono">{winner.winner_contact}</td>
                                <td className="table-cell">
                                  {winner.winner_address || <span className="text-secondary-400">No address</span>}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-secondary-500">
                      No winners registered for this category yet
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="text-center mt-12 mb-6 text-secondary-500 text-sm">
          <p>Total Winners: {winners.length}</p>
          <p className="mt-2">Last Updated: {new Date().toLocaleString('en-IN')}</p>
        </div>
      </div>
    </div>
  );
};

export default PublicWinners;

