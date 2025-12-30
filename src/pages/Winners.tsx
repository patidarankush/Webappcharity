import React, { useState, useEffect } from 'react';
import { supabase, LotteryWinner, PRIZE_CATEGORIES, formatLotteryNumber } from '../lib/supabase';
import { 
  Trophy,
  Award,
  Edit,
  Trash2,
  Search,
  Save,
  X,
  AlertCircle,
  CheckCircle,
  Calendar,
  User,
  Phone,
  MapPin,
  Ticket
} from 'lucide-react';
import toast from 'react-hot-toast';

const Winners: React.FC = () => {
  const [winners, setWinners] = useState<LotteryWinner[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [editingWinner, setEditingWinner] = useState<LotteryWinner | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [lastWinner, setLastWinner] = useState<LotteryWinner | null>(null);

  useEffect(() => {
    fetchWinners();
  }, []);

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
      toast.error('Failed to fetch winners');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (winner: LotteryWinner) => {
    setEditingWinner(winner);
    setShowEditForm(true);
  };

  const handleDelete = async (winnerId: string) => {
    if (!window.confirm('Are you sure you want to delete this winner entry?')) return;

    try {
      const { error } = await supabase
        .from('lottery_winners')
        .delete()
        .eq('id', winnerId);

      if (error) throw error;

      toast.success('Winner entry deleted successfully');
      fetchWinners();
    } catch (error) {
      console.error('Error deleting winner:', error);
      toast.error('Failed to delete winner entry');
    }
  };

  const handleSaveEdit = async (updatedData: Partial<LotteryWinner>) => {
    if (!editingWinner) return;

    try {
      const { error } = await supabase
        .from('lottery_winners')
        .update({
          prize_category: updatedData.prize_category,
          winner_name: updatedData.winner_name,
          winner_contact: updatedData.winner_contact,
          winner_address: updatedData.winner_address,
          notes: updatedData.notes
        })
        .eq('id', editingWinner.id);

      if (error) throw error;

      toast.success('Winner entry updated successfully');
      setShowEditForm(false);
      setEditingWinner(null);
      fetchWinners();
    } catch (error) {
      console.error('Error updating winner:', error);
      toast.error('Failed to update winner entry');
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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-secondary-900">Lottery Winners</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Manage and view all lottery prize winners
        </p>
      </div>

      {/* Last Winner Section */}
      {lastWinner && (
        <div className="card bg-gradient-to-r from-success-50 to-primary-50 border-2 border-success-300">
          <div className="card-header">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-secondary-900 flex items-center">
                <Trophy className="h-5 w-5 mr-2 text-success-600" />
                Last Winner
              </h3>
              <span className="badge badge-success">Latest</span>
            </div>
          </div>
          <div className="card-content">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg p-4">
                <p className="text-sm text-secondary-600">Lottery Number</p>
                <p className="text-xl font-bold text-primary-600 font-mono">
                  {formatLotteryNumber(lastWinner.lottery_number)}
                </p>
              </div>
              <div className="bg-white rounded-lg p-4">
                <p className="text-sm text-secondary-600">Winner Name</p>
                <p className="text-lg font-semibold text-secondary-900">{lastWinner.winner_name}</p>
              </div>
              <div className="bg-white rounded-lg p-4">
                <p className="text-sm text-secondary-600">Prize Won</p>
                <p className="text-lg font-semibold text-success-600">{lastWinner.prize_category}</p>
              </div>
              <div className="bg-white rounded-lg p-4">
                <p className="text-sm text-secondary-600">Registered At</p>
                <p className="text-sm font-medium text-secondary-700">
                  {new Date(lastWinner.registered_at).toLocaleString('en-IN')}
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-lg p-4">
                <p className="text-sm text-secondary-600">Contact</p>
                <p className="font-mono text-secondary-900">{lastWinner.winner_contact}</p>
              </div>
              {lastWinner.winner_address && (
                <div className="bg-white rounded-lg p-4">
                  <p className="text-sm text-secondary-600">Address</p>
                  <p className="text-secondary-900">{lastWinner.winner_address}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Search and Filter */}
      <div className="card">
        <div className="card-content">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-secondary-400" />
              <input
                type="text"
                placeholder="Search by lottery number, name, contact, or prize..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-10"
              />
            </div>
            <div className="md:w-64">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="input"
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
                          <th className="table-header-cell">Registered At</th>
                          <th className="table-header-cell">Actions</th>
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
                              <td className="table-cell">
                                {new Date(winner.registered_at).toLocaleString('en-IN')}
                              </td>
                              <td className="table-cell">
                                <div className="flex items-center space-x-2">
                                  <button
                                    onClick={() => handleEdit(winner)}
                                    className="text-primary-600 hover:text-primary-800"
                                    title="Edit"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(winner.id)}
                                    className="text-danger-600 hover:text-danger-800"
                                    title="Delete"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
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

      {/* Edit Form Modal */}
      {showEditForm && editingWinner && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-secondary-900 bg-opacity-50 transition-opacity" onClick={() => setShowEditForm(false)}></div>
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-strong transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-secondary-900">Edit Winner Entry</h3>
                  <button
                    onClick={() => setShowEditForm(false)}
                    className="text-secondary-400 hover:text-secondary-600"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-secondary-700 mb-1">
                      Lottery Number
                    </label>
                    <input
                      type="text"
                      value={formatLotteryNumber(editingWinner.lottery_number)}
                      disabled
                      className="input bg-secondary-50"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-secondary-700 mb-1">
                      Prize Category *
                    </label>
                    <select
                      value={editingWinner.prize_category}
                      onChange={(e) => setEditingWinner({ ...editingWinner, prize_category: e.target.value })}
                      className="input"
                    >
                      {PRIZE_CATEGORIES.map((prize) => (
                        <option key={prize.name} value={prize.name}>
                          {prize.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-secondary-700 mb-1">
                      Winner Name *
                    </label>
                    <input
                      type="text"
                      value={editingWinner.winner_name}
                      onChange={(e) => setEditingWinner({ ...editingWinner, winner_name: e.target.value })}
                      className="input"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-secondary-700 mb-1">
                      Contact Number *
                    </label>
                    <input
                      type="text"
                      value={editingWinner.winner_contact}
                      onChange={(e) => setEditingWinner({ ...editingWinner, winner_contact: e.target.value })}
                      className="input"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-secondary-700 mb-1">
                      Address
                    </label>
                    <textarea
                      value={editingWinner.winner_address || ''}
                      onChange={(e) => setEditingWinner({ ...editingWinner, winner_address: e.target.value })}
                      className="input"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-secondary-700 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={editingWinner.notes || ''}
                      onChange={(e) => setEditingWinner({ ...editingWinner, notes: e.target.value })}
                      className="input"
                      rows={2}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-secondary-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  onClick={() => handleSaveEdit(editingWinner)}
                  className="btn btn-primary sm:ml-3 sm:w-auto"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </button>
                <button
                  onClick={() => setShowEditForm(false)}
                  className="btn btn-secondary sm:w-auto"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Winners;

