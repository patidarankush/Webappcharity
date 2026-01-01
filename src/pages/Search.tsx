import React, { useState, useEffect } from 'react';
import { supabase, TicketSale, DiaryAllotment, Issuer, Diary, formatLotteryNumber, parseLotteryNumber, getDiaryFromLotteryNumber, LotteryWinner, PRIZE_CATEGORIES } from '../lib/supabase';
import { 
  Search as SearchIcon, 
  Filter, 
  Download, 
  Calendar,
  User,
  Phone,
  MapPin,
  BookOpen,
  DollarSign,
  Ticket,
  AlertCircle,
  CheckCircle,
  Clock,
  RotateCcw,
  Trophy,
  Award
} from 'lucide-react';
import toast from 'react-hot-toast';

interface SearchFilters {
  lottery_number: string;
  purchaser_name: string;
  purchaser_contact: string;
  issuer_name: string;
  diary_number: string;
  first_diary_number: string;
  date_from: string;
  date_to: string;
  status: string;
}

const Search: React.FC = () => {
  const [filters, setFilters] = useState<SearchFilters>({
    lottery_number: '',
    purchaser_name: '',
    purchaser_contact: '',
    issuer_name: '',
    diary_number: '',
    first_diary_number: '',
    date_from: '',
    date_to: '',
    status: '',
  });
  
  const [searchResults, setSearchResults] = useState<{
    tickets: TicketSale[];
    allotments: DiaryAllotment[];
  }>({ tickets: [], allotments: [] });
  
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'tickets' | 'allotments'>('tickets');
  const [showFilters, setShowFilters] = useState(false);
  const [quickSearchTerm, setQuickSearchTerm] = useState('');
  
  // Winner registration states
  const [registeringWinner, setRegisteringWinner] = useState<string | null>(null);
  const [selectedPrize, setSelectedPrize] = useState<{ [key: string]: string }>({});
  const [existingWinners, setExistingWinners] = useState<Set<number>>(new Set());

  const handleFilterChange = (key: keyof SearchFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const performSearch = async () => {
    try {
      setLoading(true);
      
      // Build search queries
      let ticketQuery = supabase
        .from('ticket_sales')
        .select(`
          *,
          issuer:issuers(*),
          diary:diaries(*)
        `);

      let allotmentQuery = supabase
        .from('diary_allotments')
        .select(`
          *,
          diary:diaries(*),
          issuer:issuers(*)
        `);

      // Apply filters
      if (filters.lottery_number) {
        const lotteryNum = parseLotteryNumber(filters.lottery_number);
        ticketQuery = ticketQuery.eq('lottery_number', lotteryNum);
      }

      if (filters.purchaser_name) {
        ticketQuery = ticketQuery.ilike('purchaser_name', `%${filters.purchaser_name}%`);
      }

      if (filters.purchaser_contact) {
        ticketQuery = ticketQuery.ilike('purchaser_contact', `%${filters.purchaser_contact}%`);
      }

      if (filters.issuer_name) {
        // First get issuers that match the name
        const { data: issuers, error: issuerError } = await supabase
          .from('issuers')
          .select('id')
          .ilike('issuer_name', `%${filters.issuer_name}%`);
        
        if (issuerError) throw issuerError;
        
        if (issuers && issuers.length > 0) {
          const issuerIds = issuers.map(i => i.id);
          ticketQuery = ticketQuery.in('issuer_id', issuerIds);
          allotmentQuery = allotmentQuery.in('issuer_id', issuerIds);
        } else {
          // If no issuers found, return empty results
          setSearchResults({ tickets: [], allotments: [] });
          toast.error(`No issuer found with name containing "${filters.issuer_name}"`);
          return;
        }
      }

      if (filters.diary_number) {
        const diaryNumber = parseInt(filters.diary_number);
        // Get the diary first to get its ID
        const { data: diary, error: diaryError } = await supabase
          .from('diaries')
          .select('id')
          .eq('diary_number', diaryNumber)
          .single();
        
        if (diaryError) throw diaryError;
        
        if (diary) {
          // Show all tickets from this diary
          ticketQuery = ticketQuery.eq('diary_id', diary.id);
          allotmentQuery = allotmentQuery.eq('diary_id', diary.id);
        } else {
          // If no diary found, return empty results
          setSearchResults({ tickets: [], allotments: [] });
          toast.error(`No diary found with number ${diaryNumber}`);
          return;
        }
      }

      if (filters.first_diary_number) {
        const firstTicketNumber = parseInt(filters.first_diary_number);
        // Find all diaries that have this lottery number as their first ticket
        const { data: diaries, error: diaryError } = await supabase
          .from('diaries')
          .select('id')
          .eq('ticket_start_range', firstTicketNumber);
        
        if (diaryError) throw diaryError;
        
        if (diaries && diaries.length > 0) {
          const diaryIds = diaries.map(d => d.id);
          // Show all tickets from all diaries that have this lottery number as their first ticket
          ticketQuery = ticketQuery.in('diary_id', diaryIds);
          allotmentQuery = allotmentQuery.in('diary_id', diaryIds);
        } else {
          // If no diaries found, return empty results
          setSearchResults({ tickets: [], allotments: [] });
          toast.error(`No diaries found with lottery number ${formatLotteryNumber(firstTicketNumber)} as first ticket`);
          return;
        }
      }

      if (filters.date_from) {
        ticketQuery = ticketQuery.gte('purchase_date', filters.date_from);
        allotmentQuery = allotmentQuery.gte('allotment_date', filters.date_from);
      }

      if (filters.date_to) {
        ticketQuery = ticketQuery.lte('purchase_date', filters.date_to);
        allotmentQuery = allotmentQuery.lte('allotment_date', filters.date_to);
      }

      if (filters.status) {
        allotmentQuery = allotmentQuery.eq('status', filters.status);
      }

      // Execute queries
      const [ticketsResult, allotmentsResult] = await Promise.all([
        ticketQuery.order('created_at', { ascending: false }),
        allotmentQuery.order('created_at', { ascending: false })
      ]);

      if (ticketsResult.error) throw ticketsResult.error;
      if (allotmentsResult.error) throw allotmentsResult.error;

      setSearchResults({
        tickets: ticketsResult.data || [],
        allotments: allotmentsResult.data || []
      });

      toast.success(`Found ${ticketsResult.data?.length || 0} tickets and ${allotmentsResult.data?.length || 0} allotments`);
    } catch (error) {
      console.error('Error performing search:', error);
      toast.error('Failed to perform search');
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setFilters({
      lottery_number: '',
      purchaser_name: '',
      purchaser_contact: '',
      issuer_name: '',
      diary_number: '',
      first_diary_number: '',
      date_from: '',
      date_to: '',
      status: '',
    });
    setSearchResults({ tickets: [], allotments: [] });
  };

  const handleQuickSearch = async () => {
    if (!quickSearchTerm.trim()) {
      toast.error('Please enter a lottery number');
      return;
    }

    try {
      setLoading(true);
      
      // Parse the lottery number (handle both 5-digit and regular format)
      let lotteryNumber: number;
      if (quickSearchTerm.length === 5 && /^[0-9]{5}$/.test(quickSearchTerm)) {
        // 5-digit format (00005)
        lotteryNumber = parseLotteryNumber(quickSearchTerm);
      } else if (/^[0-9]+$/.test(quickSearchTerm)) {
        // Regular number format (5)
        lotteryNumber = parseInt(quickSearchTerm, 10);
      } else {
        toast.error('Please enter a valid lottery number');
        return;
      }

      // Validate range
      if (lotteryNumber < 1 || lotteryNumber > 39999) {
        toast.error('Lottery number must be between 00001 and 39999');
        return;
      }

      // Search for the ticket
      const { data: tickets, error } = await supabase
        .from('ticket_sales')
        .select(`
          *,
          issuer:issuers(*),
          diary:diaries(*)
        `)
        .eq('lottery_number', lotteryNumber);

      if (error) throw error;

      if (tickets && tickets.length > 0) {
        setSearchResults({ tickets, allotments: [] });
        setActiveTab('tickets');
        toast.success(`Found ticket for lottery number ${formatLotteryNumber(lotteryNumber)}`);
      } else {
        setSearchResults({ tickets: [], allotments: [] });
        toast.error(`No ticket found for lottery number ${formatLotteryNumber(lotteryNumber)}`);
      }
    } catch (error) {
      console.error('Error searching for lottery number:', error);
      toast.error('Failed to search for lottery number');
    } finally {
      setLoading(false);
    }
  };

  // Fetch existing winners on component mount
  useEffect(() => {
    const fetchExistingWinners = async () => {
      try {
        const { data, error } = await supabase
          .from('lottery_winners')
          .select('lottery_number');
        
        if (error) throw error;
        
        if (data) {
          setExistingWinners(new Set(data.map(w => w.lottery_number)));
        }
      } catch (error) {
        console.error('Error fetching existing winners:', error);
      }
    };
    
    fetchExistingWinners();
  }, []);

  const checkIfAlreadyWon = (lotteryNumber: number): boolean => {
    return existingWinners.has(lotteryNumber);
  };

  const getPrizeQuantity = (prizeName: string): number => {
    const prize = PRIZE_CATEGORIES.find(p => p.name === prizeName);
    return prize ? prize.quantity : 0;
  };

  const getRemainingQuantity = async (prizeName: string): Promise<number> => {
    try {
      const { data, error } = await supabase
        .from('lottery_winners')
        .select('id')
        .eq('prize_category', prizeName);
      
      if (error) throw error;
      
      const totalQuantity = getPrizeQuantity(prizeName);
      const usedQuantity = data?.length || 0;
      return totalQuantity - usedQuantity;
    } catch (error) {
      console.error('Error getting remaining quantity:', error);
      return 0;
    }
  };

  const registerWinner = async (ticket: TicketSale) => {
    const lotteryNumber = ticket.lottery_number;
    const selectedPrizeCategory = selectedPrize[ticket.id];

    if (!selectedPrizeCategory) {
      toast.error('Please select a prize category');
      return;
    }

    // Check if already won
    if (checkIfAlreadyWon(lotteryNumber)) {
      toast.error(`Lottery number ${formatLotteryNumber(lotteryNumber)} has already won a prize!`, {
        duration: 5000
      });
      return;
    }

    // Check remaining quantity
    const remaining = await getRemainingQuantity(selectedPrizeCategory);
    if (remaining <= 0) {
      toast.error(`No ${selectedPrizeCategory} prizes remaining!`);
      return;
    }

    // Validate ticket data before registration
    if (!ticket.purchaser_name || ticket.purchaser_name.trim().length === 0) {
      toast.error('Ticket purchaser name is missing or empty. Cannot register winner.');
      return;
    }

    if (!ticket.purchaser_contact || ticket.purchaser_contact.trim().length === 0) {
      toast.error('Ticket purchaser contact is missing or empty. Cannot register winner.');
      return;
    }

    try {
      setRegisteringWinner(ticket.id);

      const prizeQuantity = getPrizeQuantity(selectedPrizeCategory);
      const diaryNumber = ticket.diary ? getDiaryFromLotteryNumber(lotteryNumber) : undefined;

      const { data, error } = await supabase
        .from('lottery_winners')
        .insert([{
          lottery_number: lotteryNumber,
          ticket_sale_id: ticket.id,
          prize_category: selectedPrizeCategory.trim(),
          prize_quantity: prizeQuantity,
          winner_name: ticket.purchaser_name.trim(),
          winner_contact: ticket.purchaser_contact.trim(),
          winner_address: ticket.purchaser_address?.trim() || null,
          diary_number: diaryNumber
        }])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') { // Unique constraint violation
          toast.error(`Lottery number ${formatLotteryNumber(lotteryNumber)} has already won a prize!`, {
            duration: 5000
          });
          // Refresh existing winners
          const { data: winners } = await supabase
            .from('lottery_winners')
            .select('lottery_number');
          if (winners) {
            setExistingWinners(new Set(winners.map(w => w.lottery_number)));
          }
        } else {
          throw error;
        }
        return;
      }

      // Update existing winners set
      setExistingWinners(prev => new Set(prev).add(lotteryNumber));
      
      // Clear selected prize
      setSelectedPrize(prev => {
        const newState = { ...prev };
        delete newState[ticket.id];
        return newState;
      });

      toast.success(`Winner registered! ${ticket.purchaser_name} won ${selectedPrizeCategory}`);
    } catch (error: any) {
      console.error('Error registering winner:', error);
      toast.error(`Failed to register winner: ${error.message || 'Unknown error'}`);
    } finally {
      setRegisteringWinner(null);
    }
  };

  const exportResults = () => {
    const data = activeTab === 'tickets' ? searchResults.tickets : searchResults.allotments;
    
    if (data.length === 0) {
      toast.error('No data to export');
      return;
    }

    const csvContent = generateCSV(data);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${activeTab}_search_results_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('Data exported successfully');
  };

  const generateCSV = (data: any[]) => {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]).filter(key => 
      !['id', 'created_at', 'updated_at'].includes(key)
    );
    
    const csvRows = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          if (typeof value === 'object' && value !== null) {
            return `"${value.issuer_name || value.diary_number || ''}"`;
          }
          return `"${value || ''}"`;
        }).join(',')
      )
    ];
    
    return csvRows.join('\n');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'allotted':
        return <Clock className="h-4 w-4 text-warning-500" />;
      case 'fully_sold':
        return <CheckCircle className="h-4 w-4 text-success-500" />;
      case 'paid':
        return <CheckCircle className="h-4 w-4 text-success-500" />;
      case 'returned':
        return <RotateCcw className="h-4 w-4 text-danger-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-secondary-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'allotted':
        return 'badge-warning';
      case 'fully_sold':
        return 'badge-success';
      case 'paid':
        return 'badge-success';
      case 'returned':
        return 'badge-danger';
      default:
        return 'badge-secondary';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900">Advanced Search</h1>
          <p className="mt-1 text-sm text-secondary-500">
            Search across tickets and diary allotments with multiple criteria
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="btn btn-secondary"
          >
            <Filter className="h-4 w-4 mr-2" />
            {showFilters ? 'Hide' : 'Show'} Filters
          </button>
          <button
            onClick={exportResults}
            className="btn btn-primary"
            disabled={searchResults.tickets.length === 0 && searchResults.allotments.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </button>
        </div>
      </div>

      {/* Center Search Bar */}
      <div className="bg-white rounded-lg shadow-soft p-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-4">
            <h2 className="text-lg font-semibold text-secondary-900 mb-2">Quick Lottery Search</h2>
            <p className="text-sm text-secondary-600">Enter a lottery number to find ticket details instantly</p>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <input
                type="text"
                value={quickSearchTerm}
                onChange={(e) => setQuickSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleQuickSearch()}
                className="input text-center text-lg font-mono"
                placeholder="Enter lottery number (e.g., 00005 or 5)"
                maxLength={5}
              />
            </div>
            <button
              onClick={handleQuickSearch}
              className="btn btn-primary px-6"
              disabled={!quickSearchTerm.trim()}
            >
              <SearchIcon className="h-5 w-5 mr-2" />
              Search
            </button>
          </div>
        </div>
      </div>

      {/* Search Filters */}
      {showFilters && (
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-secondary-900">Search Filters</h3>
          </div>
          <div className="card-content">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Lottery Number */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  <Ticket className="h-4 w-4 inline mr-1" />
                  Lottery Number
                </label>
                <input
                  type="text"
                  value={filters.lottery_number}
                  onChange={(e) => handleFilterChange('lottery_number', e.target.value)}
                  className="input"
                  placeholder="Enter lottery number (00001-39999)"
                  maxLength={5}
                />
              </div>

              {/* Purchaser Name */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  <User className="h-4 w-4 inline mr-1" />
                  Purchaser Name
                </label>
                <input
                  type="text"
                  value={filters.purchaser_name}
                  onChange={(e) => handleFilterChange('purchaser_name', e.target.value)}
                  className="input"
                  placeholder="Enter purchaser name"
                />
              </div>

              {/* Contact Number */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  <Phone className="h-4 w-4 inline mr-1" />
                  Contact Number
                </label>
                <input
                  type="tel"
                  value={filters.purchaser_contact}
                  onChange={(e) => handleFilterChange('purchaser_contact', e.target.value)}
                  className="input"
                  placeholder="Enter contact number"
                />
              </div>

              {/* Issuer Name */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  <User className="h-4 w-4 inline mr-1" />
                  Issuer Name
                </label>
                <input
                  type="text"
                  value={filters.issuer_name}
                  onChange={(e) => handleFilterChange('issuer_name', e.target.value)}
                  className="input"
                  placeholder="Enter issuer name"
                />
              </div>

              {/* Diary Number */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  <BookOpen className="h-4 w-4 inline mr-1" />
                  Diary Number
                </label>
                <input
                  type="number"
                  value={filters.diary_number}
                  onChange={(e) => handleFilterChange('diary_number', e.target.value)}
                  className="input"
                  placeholder="Enter diary number"
                />
              </div>

                                            {/* First Ticket Number Filter */}
               <div>
                 <label className="block text-sm font-medium text-secondary-700 mb-1">
                   <BookOpen className="h-4 w-4 inline mr-1" />
                   First Ticket Number Filter
                 </label>
                 <input
                   type="number"
                   value={filters.first_diary_number}
                   onChange={(e) => handleFilterChange('first_diary_number', e.target.value)}
                   className="input"
                   placeholder="Enter lottery number to find all diaries that start with this number"
                 />
               </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  Status
                </label>
                <select
                  value={filters.status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className="input"
                >
                  <option value="">All Statuses</option>
                  <option value="allotted">Allotted</option>
                  <option value="fully_sold">Fully Sold</option>
                  <option value="paid">Paid</option>
                  <option value="returned">Returned</option>
                </select>
              </div>

              {/* Date From */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  <Calendar className="h-4 w-4 inline mr-1" />
                  Date From
                </label>
                <input
                  type="date"
                  value={filters.date_from}
                  onChange={(e) => handleFilterChange('date_from', e.target.value)}
                  className="input"
                />
              </div>

              {/* Date To */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  <Calendar className="h-4 w-4 inline mr-1" />
                  Date To
                </label>
                <input
                  type="date"
                  value={filters.date_to}
                  onChange={(e) => handleFilterChange('date_to', e.target.value)}
                  className="input"
                />
              </div>


            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={clearFilters}
                className="btn btn-secondary"
              >
                Clear Filters
              </button>
              <button
                onClick={performSearch}
                disabled={loading}
                className="btn btn-primary"
              >
                <SearchIcon className="h-4 w-4 mr-2" />
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results Tabs */}
      <div className="border-b border-secondary-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('tickets')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'tickets'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'
            }`}
          >
            Tickets ({searchResults.tickets.length})
          </button>
          <button
            onClick={() => setActiveTab('allotments')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'allotments'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'
            }`}
          >
            Allotments ({searchResults.allotments.length})
          </button>
        </nav>
      </div>

      {/* Quick Search Results */}
      {quickSearchTerm && searchResults.tickets.length > 0 && (
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-6">
          <div className="text-center mb-4">
            <h3 className="text-lg font-semibold text-primary-900 mb-2">
              🎫 Lottery Ticket Found!
            </h3>
            <p className="text-sm text-primary-700">
              Lottery Number: <span className="font-mono font-bold text-lg">{formatLotteryNumber(searchResults.tickets[0].lottery_number)}</span>
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h4 className="font-semibold text-secondary-900 mb-2">Purchaser Details</h4>
              <p className="text-sm text-secondary-700"><strong>Name:</strong> {searchResults.tickets[0].purchaser_name}</p>
              <p className="text-sm text-secondary-700"><strong>Contact:</strong> {searchResults.tickets[0].purchaser_contact}</p>
              {searchResults.tickets[0].purchaser_address && (
                <p className="text-sm text-secondary-700"><strong>Address:</strong> {searchResults.tickets[0].purchaser_address}</p>
              )}
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h4 className="font-semibold text-secondary-900 mb-2">Sale Details</h4>
              <p className="text-sm text-secondary-700"><strong>Amount:</strong> ₹{searchResults.tickets[0].amount_paid}</p>
              <p className="text-sm text-secondary-700"><strong>Date:</strong> {new Date(searchResults.tickets[0].purchase_date).toLocaleDateString('en-IN')}</p>
              <p className="text-sm text-secondary-700"><strong>Issuer:</strong> {searchResults.tickets[0].issuer?.issuer_name}</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h4 className="font-semibold text-secondary-900 mb-2">Diary Information</h4>
              <p className="text-sm text-secondary-700"><strong>Diary:</strong> {searchResults.tickets[0].diary?.diary_number}</p>
              <p className="text-sm text-secondary-700"><strong>Range:</strong> {searchResults.tickets[0].diary ? formatLotteryNumber(searchResults.tickets[0].diary.ticket_start_range) : 'N/A'}-{searchResults.tickets[0].diary ? formatLotteryNumber(searchResults.tickets[0].diary.ticket_end_range) : 'N/A'}</p>
              <p className="text-sm text-secondary-700"><strong>Total Tickets:</strong> {searchResults.tickets[0].diary?.total_tickets}</p>
            </div>
          </div>
          
          {/* Winner Registration Section */}
          <div className="mt-6 bg-gradient-to-r from-success-50 to-primary-50 rounded-lg p-6 border border-success-200">
            <h4 className="font-semibold text-secondary-900 mb-4 flex items-center">
              <Trophy className="h-5 w-5 mr-2 text-success-600" />
              Register as Lottery Winner
            </h4>
            {checkIfAlreadyWon(searchResults.tickets[0].lottery_number) ? (
              <div className="bg-warning-50 border border-warning-200 rounded-lg p-4">
                <div className="flex items-center">
                  <AlertCircle className="h-5 w-5 text-warning-600 mr-2" />
                  <div>
                    <p className="font-semibold text-warning-900">This lottery number has already won a prize!</p>
                    <p className="text-sm text-warning-700 mt-1">A prize has already been registered for this lottery number.</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-secondary-700 mb-2">
                    Select Prize Category
                  </label>
                  <select
                    value={selectedPrize[searchResults.tickets[0].id] || ''}
                    onChange={(e) => setSelectedPrize(prev => ({
                      ...prev,
                      [searchResults.tickets[0].id]: e.target.value
                    }))}
                    className="input w-full"
                  >
                    <option value="">Select Prize Category</option>
                    {PRIZE_CATEGORIES.map((prize) => (
                      <option key={prize.name} value={prize.name}>
                        {prize.name} (Total: {prize.quantity})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="pt-6">
                  <button
                    onClick={() => registerWinner(searchResults.tickets[0])}
                    disabled={!selectedPrize[searchResults.tickets[0].id] || registeringWinner === searchResults.tickets[0].id}
                    className="btn btn-success"
                  >
                    {registeringWinner === searchResults.tickets[0].id ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white inline-block mr-2"></div>
                        Registering...
                      </>
                    ) : (
                      <>
                        <Award className="h-4 w-4 mr-2" />
                        Register Winner
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Search No Results */}
      {quickSearchTerm && searchResults.tickets.length === 0 && !loading && (
        <div className="bg-warning-50 border border-warning-200 rounded-lg p-6 text-center">
          <div className="text-warning-600 mb-2">
            <AlertCircle className="h-12 w-12 mx-auto mb-3" />
            <h3 className="text-lg font-semibold">No Ticket Found</h3>
            <p className="text-sm">
              No ticket found for lottery number <span className="font-mono font-bold">{quickSearchTerm}</span>
            </p>
            <p className="text-xs text-warning-600 mt-2">
              Make sure the lottery number is correct and the ticket has been sold.
            </p>
          </div>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-secondary-900">
              Search Results - {activeTab === 'tickets' ? 'Tickets' : 'Allotments'}
            </h3>
          </div>
          <div className="card-content">
            {activeTab === 'tickets' ? (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead className="table-header">
                    <tr>
                      <th className="table-header-cell">Lottery #</th>
                      <th className="table-header-cell">Purchaser</th>
                      <th className="table-header-cell">Contact</th>
                      <th className="table-header-cell">Issuer</th>
                      <th className="table-header-cell">Diary</th>
                      <th className="table-header-cell">Date</th>
                      <th className="table-header-cell">Amount</th>
                      <th className="table-header-cell">Register Winner</th>
                    </tr>
                  </thead>
                  <tbody className="table-body">
                    {searchResults.tickets.map((ticket) => (
                      <tr key={ticket.id} className="table-row">
                        <td className="table-cell font-mono font-medium">
                          {formatLotteryNumber(ticket.lottery_number)}
                        </td>
                        <td className="table-cell">
                          <div>
                            <div className="font-medium">{ticket.purchaser_name}</div>
                            {ticket.purchaser_address && (
                              <div className="text-sm text-secondary-500 truncate max-w-xs">
                                {ticket.purchaser_address}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="table-cell font-mono">{ticket.purchaser_contact}</td>
                        <td className="table-cell">{ticket.issuer?.issuer_name}</td>
                        <td className="table-cell">
                          <span className="badge badge-secondary">
                            Diary {ticket.diary?.diary_number}
                          </span>
                        </td>
                        <td className="table-cell">
                          {new Date(ticket.purchase_date).toLocaleDateString('en-IN')}
                        </td>
                        <td className="table-cell font-medium">₹{ticket.amount_paid}</td>
                        <td className="table-cell">
                          {checkIfAlreadyWon(ticket.lottery_number) ? (
                            <span className="badge badge-success">
                              <Trophy className="h-3 w-3 inline mr-1" />
                              Already Won
                            </span>
                          ) : (
                            <div className="flex items-center space-x-2">
                              <select
                                value={selectedPrize[ticket.id] || ''}
                                onChange={(e) => setSelectedPrize(prev => ({
                                  ...prev,
                                  [ticket.id]: e.target.value
                                }))}
                                className="input input-sm text-xs"
                                style={{ minWidth: '150px' }}
                              >
                                <option value="">Select Prize</option>
                                {PRIZE_CATEGORIES.map((prize) => (
                                  <option key={prize.name} value={prize.name}>
                                    {prize.name} ({prize.quantity})
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => registerWinner(ticket)}
                                disabled={!selectedPrize[ticket.id] || registeringWinner === ticket.id}
                                className="btn btn-success btn-sm"
                                title="Register as Winner"
                              >
                                {registeringWinner === ticket.id ? (
                                  <>
                                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white inline-block mr-1"></div>
                                    Registering...
                                  </>
                                ) : (
                                  <>
                                    <Award className="h-3 w-3 mr-1" />
                                    Register
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead className="table-header">
                    <tr>
                      <th className="table-header-cell">Diary</th>
                      <th className="table-header-cell">Issuer</th>
                      <th className="table-header-cell">Contact</th>
                      <th className="table-header-cell">Allotment Date</th>
                      <th className="table-header-cell">Status</th>
                      <th className="table-header-cell">Amount Collected</th>
                      <th className="table-header-cell">Expected Amount</th>
                    </tr>
                  </thead>
                  <tbody className="table-body">
                    {searchResults.allotments.map((allotment) => (
                      <tr key={allotment.id} className="table-row">
                        <td className="table-cell">
                          <span className="badge badge-secondary">
                            Diary {allotment.diary?.diary_number}
                          </span>
                          <div className="text-xs text-secondary-500 mt-1">
                            Tickets: {allotment.diary?.ticket_start_range}-{allotment.diary?.ticket_end_range}
                          </div>
                        </td>
                        <td className="table-cell">
                          <div className="font-medium">{allotment.issuer?.issuer_name}</div>
                          {allotment.issuer?.address && (
                            <div className="text-sm text-secondary-500 truncate max-w-xs">
                              {allotment.issuer.address}
                            </div>
                          )}
                        </td>
                        <td className="table-cell font-mono">{allotment.issuer?.contact_number}</td>
                        <td className="table-cell">
                          {new Date(allotment.allotment_date).toLocaleDateString('en-IN')}
                        </td>
                        <td className="table-cell">
                          <div className="flex items-center space-x-2">
                            {getStatusIcon(allotment.status)}
                            <span className={`badge ${getStatusBadge(allotment.status)}`}>
                              {allotment.status.replace('_', ' ')}
                            </span>
                          </div>
                        </td>
                        <td className="table-cell font-medium">₹{allotment.amount_collected.toLocaleString()}</td>
                        <td className="table-cell">₹{allotment.diary?.expected_amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {((activeTab === 'tickets' && searchResults.tickets.length === 0) ||
              (activeTab === 'allotments' && searchResults.allotments.length === 0)) && (
              <div className="text-center py-12">
                <SearchIcon className="mx-auto h-12 w-12 text-secondary-400" />
                <h3 className="mt-2 text-sm font-medium text-secondary-900">No results found</h3>
                <p className="mt-1 text-sm text-secondary-500">
                  Try adjusting your search criteria or filters.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Search;
