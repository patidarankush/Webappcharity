import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { supabase, TicketSale, Issuer, Diary, getDiaryFromLotteryNumber, validateLotteryNumberForDiary, formatLotteryNumber, parseLotteryNumber, getFormattedTicketRangeForDiary } from '../lib/supabase';
import { 
  Plus, 
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
  BookOpen
} from 'lucide-react';
import toast from 'react-hot-toast';

interface TicketFormData {
  lottery_number: number;
  purchaser_name: string;
  purchaser_contact: string;
  purchaser_address: string;
  issuer_id: string;
  diary_id: string;
  purchase_date: string;
  amount_paid: number;
}

const TicketSales: React.FC = () => {
  const [tickets, setTickets] = useState<TicketSale[]>([]);
  const [issuers, setIssuers] = useState<Issuer[]>([]);
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTicket, setEditingTicket] = useState<TicketSale | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [autoFillData, setAutoFillData] = useState<{ issuer?: Issuer; diary?: Diary } | null>(null);
  
  // Diary search states
  const [diarySearchTerm, setDiarySearchTerm] = useState('');
  const [showDiarySuggestions, setShowDiarySuggestions] = useState(false);
  const [filteredDiaries, setFilteredDiaries] = useState<Diary[]>([]);
  const [selectedDiary, setSelectedDiary] = useState<Diary | null>(null);
  
  // Ticket number search states
  const [ticketSearchNumber, setTicketSearchNumber] = useState('');
  const [searchedTicket, setSearchedTicket] = useState<TicketSale | null>(null);
  const [searching, setSearching] = useState(false);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<TicketFormData>();

  const watchedLotteryNumber = watch('lottery_number');

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (watchedLotteryNumber && watchedLotteryNumber.toString().length === 5) {
      const lotteryNum = parseLotteryNumber(watchedLotteryNumber.toString());
      if (lotteryNum >= 1 && lotteryNum <= 39999) {
        handleLotteryNumberChange(lotteryNum);
      }
    } else if (!watchedLotteryNumber) {
      // Clear auto-fill data when lottery number is cleared
      setAutoFillData(null);
    }
  }, [watchedLotteryNumber]);

  // Handle diary search with server-side search for better performance
  useEffect(() => {
    if (diarySearchTerm.trim() === '') {
      setFilteredDiaries([]);
      setShowDiarySuggestions(false);
      return;
    }

    const searchNumber = parseInt(diarySearchTerm);
    if (!isNaN(searchNumber)) {
      // First try to find in local diaries array
      const exactMatch = diaries.find(diary => diary.diary_number === searchNumber);
      if (exactMatch) {
        setFilteredDiaries([exactMatch]);
        setShowDiarySuggestions(true);
      } else {
        // If not found locally and number is > 1000, search server-side
        if (searchNumber > 1000) {
          searchDiaryOnServer(searchNumber);
        } else {
          // Search by diary number range in local array
          const matches = diaries.filter(diary => 
            diary.diary_number.toString().includes(diarySearchTerm)
          ).slice(0, 10);
          setFilteredDiaries(matches);
          setShowDiarySuggestions(matches.length > 0);
        }
      }
    } else {
      setFilteredDiaries([]);
      setShowDiarySuggestions(false);
    }
  }, [diarySearchTerm, diaries]);

  // Server-side diary search for numbers > 1000
  const searchDiaryOnServer = async (diaryNumber: number) => {
    try {
      const { data: diaryData, error } = await supabase
        .from('diaries')
        .select('*')
        .eq('diary_number', diaryNumber)
        .single();

      if (error) {
        console.error('Error searching diary:', error);
        setFilteredDiaries([]);
        setShowDiarySuggestions(false);
        return;
      }

      if (diaryData) {
        setFilteredDiaries([diaryData]);
        setShowDiarySuggestions(true);
      } else {
        setFilteredDiaries([]);
        setShowDiarySuggestions(false);
      }
    } catch (error) {
      console.error('Error searching diary:', error);
      setFilteredDiaries([]);
      setShowDiarySuggestions(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch tickets with joined data
      const { data: ticketsData, error: ticketsError } = await supabase
        .from('ticket_sales')
        .select(`
          *,
          issuer:issuers(*),
          diary:diaries(*)
        `)
        .order('created_at', { ascending: false });

      if (ticketsError) throw ticketsError;

      // Fetch issuers
      const { data: issuersData, error: issuersError } = await supabase
        .from('issuers')
        .select('*')
        .order('issuer_name');

      if (issuersError) throw issuersError;

      // Fetch diaries - use range queries to get all 1819 diaries
      const { data: diariesData, error: diariesError } = await supabase
        .from('diaries')
        .select('*')
        .order('diary_number')
        .gte('diary_number', 1)
        .lte('diary_number', 1819);

      if (diariesError) throw diariesError;

      setTickets(ticketsData || []);
      setIssuers(issuersData || []);
      setDiaries(diariesData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleLotteryNumberChange = async (lotteryNumber: number) => {
    try {
      const diaryNumber = getDiaryFromLotteryNumber(lotteryNumber);
      
      // For diary numbers > 1000, use server-side search for better performance
      let diary;
      if (diaryNumber > 1000) {
        const { data: diaryData, error: diaryError } = await supabase
          .from('diaries')
          .select('*')
          .eq('diary_number', diaryNumber)
          .single();
        
        if (diaryError) {
          console.error('Error fetching diary:', diaryError);
          return;
        }
        diary = diaryData;
      } else {
        // For diary numbers <= 1000, use local search
        diary = diaries.find(d => d.diary_number === diaryNumber);
      }
      
      if (diary) {
        // Check if diary is allotted to an issuer
        const { data: allotmentData, error } = await supabase
          .from('diary_allotments')
          .select(`
            *,
            issuer:issuers(*)
          `)
          .eq('diary_id', diary.id)
          .eq('status', 'allotted')
          .single();

        if (error || !allotmentData) {
          setAutoFillData({ diary });
          
          // Still auto-fill diary and amount even if not allotted
          setValue('diary_id', diary.id, { shouldValidate: true });
          setValue('amount_paid', 500, { shouldValidate: true });
          setValue('purchase_date', new Date().toISOString().split('T')[0], { shouldValidate: true });
          
          // Update diary input display
          setSelectedDiary(diary);
          setDiarySearchTerm(`Diary ${diary.diary_number} (Tickets: ${formatLotteryNumber(diary.ticket_start_range)}-${formatLotteryNumber(diary.ticket_end_range)})`);
          
          // Trigger form validation
          setTimeout(() => {
            const form = document.querySelector('form');
            if (form) {
              form.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }, 100);
          
          toast.error(`Diary ${diaryNumber} is not allotted to any issuer. Please select an issuer manually.`);
        } else {
          setAutoFillData({ 
            issuer: allotmentData.issuer, 
            diary 
          });
          
          // Auto-fill form fields
          setValue('diary_id', diary.id, { shouldValidate: true });
          setValue('issuer_id', allotmentData.issuer.id, { shouldValidate: true });
          setValue('amount_paid', 500, { shouldValidate: true });
          setValue('purchase_date', new Date().toISOString().split('T')[0], { shouldValidate: true });
          
          // Update diary input display
          setSelectedDiary(diary);
          setDiarySearchTerm(`Diary ${diary.diary_number} (Tickets: ${formatLotteryNumber(diary.ticket_start_range)}-${formatLotteryNumber(diary.ticket_end_range)})`);
          
          // Trigger form validation after a short delay to ensure values are set
          setTimeout(() => {
            // Force re-validation of the form
            const form = document.querySelector('form');
            if (form) {
              form.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }, 100);
          
          toast.success(`Auto-filled diary ${diaryNumber} details`);
        }
      } else {
        console.error(`Diary ${diaryNumber} not found`);
        toast.error(`Diary ${diaryNumber} not found`);
      }
    } catch (error) {
      console.error('Error auto-filling data:', error);
    }
  };

  const onSubmit = async (data: TicketFormData) => {
    try {
      // Convert lottery number string to number
      const lotteryNumber = parseLotteryNumber(data.lottery_number as any);
      
      // Validate lottery number range for diary
      if (data.diary_id) {
        const diary = diaries.find(d => d.id === data.diary_id);
        if (diary && !validateLotteryNumberForDiary(lotteryNumber, diary.diary_number)) {
          toast.error(`Lottery number ${data.lottery_number} is not valid for diary ${diary.diary_number}`);
          return;
        }
      }

      if (editingTicket) {
        // Update existing ticket
        const { error } = await supabase
          .from('ticket_sales')
          .update({
            lottery_number: lotteryNumber,
            purchaser_name: data.purchaser_name,
            purchaser_contact: data.purchaser_contact,
            purchaser_address: data.purchaser_address,
            issuer_id: data.issuer_id,
            diary_id: data.diary_id,
            purchase_date: data.purchase_date,
            amount_paid: data.amount_paid,
          })
          .eq('id', editingTicket.id);

        if (error) throw error;
        toast.success('Ticket updated successfully');
      } else {
        // Create new ticket
        const { error } = await supabase
          .from('ticket_sales')
          .insert([{
            ...data,
            lottery_number: lotteryNumber
          }]);

        if (error) throw error;
        toast.success('Ticket added successfully');
      }

      reset();
      setShowForm(false);
      setEditingTicket(null);
      setAutoFillData(null);
      fetchData();
    } catch (error: any) {
      console.error('Error saving ticket:', error);
      if (error.code === '23505') {
        toast.error('Lottery number already exists');
      } else {
        toast.error('Failed to save ticket');
      }
    }
  };

  const handleEdit = (ticket: TicketSale) => {
    setEditingTicket(ticket);
    setValue('lottery_number', ticket.lottery_number);
    setValue('purchaser_name', ticket.purchaser_name);
    setValue('purchaser_contact', ticket.purchaser_contact);
    setValue('purchaser_address', ticket.purchaser_address || '');
    setValue('issuer_id', ticket.issuer_id);
    setValue('diary_id', ticket.diary_id);
    setValue('purchase_date', ticket.purchase_date);
    setValue('amount_paid', ticket.amount_paid);
    
    // Set diary search term and selected diary for editing
    if (ticket.diary) {
      setSelectedDiary(ticket.diary);
      setDiarySearchTerm(`Diary ${ticket.diary.diary_number} (Tickets: ${formatLotteryNumber(ticket.diary.ticket_start_range)}-${formatLotteryNumber(ticket.diary.ticket_end_range)})`);
    }
    
    setShowForm(true);
  };

  const handleDelete = async (ticketId: string) => {
    if (!window.confirm('Are you sure you want to delete this ticket?')) return;

    try {
      const { error } = await supabase
        .from('ticket_sales')
        .delete()
        .eq('id', ticketId);

      if (error) throw error;
      toast.success('Ticket deleted successfully');
      fetchData();
    } catch (error) {
      console.error('Error deleting ticket:', error);
      toast.error('Failed to delete ticket');
    }
  };

  const handleCancel = () => {
    reset();
    setShowForm(false);
    setEditingTicket(null);
    setAutoFillData(null);
    setDiarySearchTerm('');
    setSelectedDiary(null);
    setShowDiarySuggestions(false);
  };

  // Diary selection handlers
  const handleDiarySearchChange = (value: string) => {
    setDiarySearchTerm(value);
    if (value.trim() === '') {
      setSelectedDiary(null);
      setValue('diary_id', '');
    }
  };

  const handleDiarySelect = (diary: Diary) => {
    setSelectedDiary(diary);
    setDiarySearchTerm(`Diary ${diary.diary_number} (Tickets: ${formatLotteryNumber(diary.ticket_start_range)}-${formatLotteryNumber(diary.ticket_end_range)})`);
    setShowDiarySuggestions(false);
    setValue('diary_id', diary.id);
  };

  const handleDiaryInputFocus = () => {
    if (diarySearchTerm.trim() !== '') {
      setShowDiarySuggestions(true);
    }
  };

  const handleDiaryInputBlur = () => {
    // Delay hiding suggestions to allow clicking on them
    setTimeout(() => {
      setShowDiarySuggestions(false);
    }, 200);
  };

  const handleTicketSearch = async () => {
    if (!ticketSearchNumber.trim()) {
      toast.error('Please enter a lottery number');
      return;
    }

    try {
      setSearching(true);
      setSearchedTicket(null);

      // Parse the lottery number
      const lotteryNum = parseLotteryNumber(ticketSearchNumber.trim());
      
      if (lotteryNum < 1 || lotteryNum > 39999) {
        toast.error('Lottery number must be between 00001 and 39999');
        setSearching(false);
        return;
      }

      // Search for ticket in database
      const { data: ticketData, error } = await supabase
        .from('ticket_sales')
        .select(`
          *,
          issuer:issuers(*),
          diary:diaries(*)
        `)
        .eq('lottery_number', lotteryNum)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned
          toast.error(`No ticket found with lottery number ${formatLotteryNumber(lotteryNum)}`);
        } else {
          throw error;
        }
      } else if (ticketData) {
        setSearchedTicket(ticketData);
        toast.success(`Ticket ${formatLotteryNumber(lotteryNum)} found`);
      }
    } catch (error) {
      console.error('Error searching ticket:', error);
      toast.error('Failed to search ticket');
    } finally {
      setSearching(false);
    }
  };

  const filteredTickets = tickets.filter(ticket =>
    formatLotteryNumber(ticket.lottery_number).includes(searchTerm) ||
    ticket.lottery_number.toString().includes(searchTerm) ||
    ticket.purchaser_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ticket.purchaser_contact.includes(searchTerm) ||
    ticket.issuer?.issuer_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900">Ticket Sales</h1>
          <p className="mt-1 text-sm text-secondary-500">
            Manage lottery ticket sales and purchaser information
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn btn-primary"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Ticket
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center space-x-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-secondary-400" />
          <input
            type="text"
            placeholder="Search by lottery number, name, contact, or issuer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      {/* Ticket Number Search */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-medium text-secondary-900">Search Ticket by Number</h3>
        </div>
        <div className="card-content">
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Enter lottery number (e.g., 00001, 28535)"
                value={ticketSearchNumber}
                onChange={(e) => {
                  setTicketSearchNumber(e.target.value);
                  if (!e.target.value.trim()) {
                    setSearchedTicket(null);
                  }
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleTicketSearch();
                  }
                }}
                className="input"
                maxLength={5}
              />
            </div>
            <button
              onClick={handleTicketSearch}
              disabled={searching || !ticketSearchNumber.trim()}
              className="btn btn-primary"
            >
              <Search className="h-4 w-4 mr-2" />
              {searching ? 'Searching...' : 'Search'}
            </button>
            {searchedTicket && (
              <button
                onClick={() => {
                  setTicketSearchNumber('');
                  setSearchedTicket(null);
                }}
                className="btn btn-secondary"
              >
                <X className="h-4 w-4 mr-2" />
                Clear
              </button>
            )}
          </div>

          {/* Display Searched Ticket */}
          {searchedTicket && (
            <div className="mt-6 border border-secondary-200 rounded-lg p-4 bg-secondary-50">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-md font-semibold text-secondary-900">
                  Ticket Details - {formatLotteryNumber(searchedTicket.lottery_number)}
                </h4>
                <button
                  onClick={() => handleEdit(searchedTicket)}
                  className="btn btn-primary btn-sm"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Ticket
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-secondary-600">Purchaser Name</p>
                  <p className="font-medium text-secondary-900">{searchedTicket.purchaser_name}</p>
                </div>
                <div>
                  <p className="text-sm text-secondary-600">Contact Number</p>
                  <p className="font-medium text-secondary-900 font-mono">{searchedTicket.purchaser_contact}</p>
                </div>
                {searchedTicket.purchaser_address && (
                  <div className="md:col-span-2">
                    <p className="text-sm text-secondary-600">Address</p>
                    <p className="font-medium text-secondary-900">{searchedTicket.purchaser_address}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-secondary-600">Issuer</p>
                  <p className="font-medium text-secondary-900">{searchedTicket.issuer?.issuer_name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-secondary-600">Diary Number</p>
                  <p className="font-medium text-secondary-900">
                    {searchedTicket.diary ? `Diary ${searchedTicket.diary.diary_number}` : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-secondary-600">Purchase Date</p>
                  <p className="font-medium text-secondary-900">
                    {new Date(searchedTicket.purchase_date).toLocaleDateString('en-IN')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-secondary-600">Amount Paid</p>
                  <p className="font-medium text-secondary-900">₹{searchedTicket.amount_paid}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-secondary-900 bg-opacity-50 transition-opacity" onClick={handleCancel}></div>
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-strong transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <form onSubmit={handleSubmit(onSubmit)}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-secondary-900">
                      {editingTicket ? 'Edit Ticket' : 'Add New Ticket'}
                    </h3>
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="text-secondary-400 hover:text-secondary-600"
                    >
                      <X className="h-6 w-6" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* Lottery Number */}
                    <div>
                      <label className="block text-sm font-medium text-secondary-700 mb-1">
                        Lottery Number *
                      </label>
                      <input
                        type="text"
                        {...register('lottery_number', { 
                          required: 'Lottery number is required',
                          pattern: {
                            value: /^[0-9]{5}$/,
                            message: 'Lottery number must be 5 digits (00001-39999)'
                          },
                          validate: (value: number) => {
                            if (value < 1 || value > 39999) {
                              return 'Lottery number must be between 00001 and 39999';
                            }
                            return true;
                          }
                        })}
                        className="input"
                        placeholder="Enter lottery number (00001-39999)"
                        maxLength={5}
                      />
                      {errors.lottery_number && (
                        <p className="mt-1 text-sm text-danger-600">{errors.lottery_number.message}</p>
                      )}
                    </div>

                    {/* Auto-fill Info */}
                    {autoFillData && (
                      <div className="bg-primary-50 border border-primary-200 rounded-md p-3">
                        <div className="flex items-center">
                          <CheckCircle className="h-4 w-4 text-primary-600 mr-2" />
                          <span className="text-sm font-medium text-primary-800">Auto-filled Information</span>
                        </div>
                        <div className="mt-2 space-y-1">
                          {autoFillData.diary && (
                            <p className="text-sm text-primary-700">
                              <strong>Diary:</strong> {autoFillData.diary.diary_number} (Tickets: {formatLotteryNumber(autoFillData.diary.ticket_start_range)}-{formatLotteryNumber(autoFillData.diary.ticket_end_range)})
                            </p>
                          )}
                          {autoFillData.issuer ? (
                            <p className="text-sm text-primary-700">
                              <strong>Issuer:</strong> {autoFillData.issuer.issuer_name} ({autoFillData.issuer.contact_number})
                            </p>
                          ) : (
                            <p className="text-sm text-warning-700">
                              <strong>Issuer:</strong> Not allotted - Please select manually
                            </p>
                          )}
                          <p className="text-sm text-primary-700">
                            <strong>Amount:</strong> ₹500.00 (can be changed)
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Purchaser Name */}
                    <div>
                      <label className="block text-sm font-medium text-secondary-700 mb-1">
                        <User className="h-4 w-4 inline mr-1" />
                        Purchaser Name *
                      </label>
                      <input
                        type="text"
                        {...register('purchaser_name', { required: 'Purchaser name is required' })}
                        className="input"
                        placeholder="Enter purchaser name"
                      />
                      {errors.purchaser_name && (
                        <p className="mt-1 text-sm text-danger-600">{errors.purchaser_name.message}</p>
                      )}
                    </div>

                    {/* Contact Number */}
                    <div>
                      <label className="block text-sm font-medium text-secondary-700 mb-1">
                        <Phone className="h-4 w-4 inline mr-1" />
                        Contact Number *
                      </label>
                      <input
                        type="tel"
                        {...register('purchaser_contact', { required: 'Contact number is required' })}
                        className="input"
                        placeholder="Enter contact number"
                      />
                      {errors.purchaser_contact && (
                        <p className="mt-1 text-sm text-danger-600">{errors.purchaser_contact.message}</p>
                      )}
                    </div>

                    {/* Address */}
                    <div>
                      <label className="block text-sm font-medium text-secondary-700 mb-1">
                        <MapPin className="h-4 w-4 inline mr-1" />
                        Address
                      </label>
                      <textarea
                        {...register('purchaser_address')}
                        className="input min-h-[80px] resize-none"
                        placeholder="Enter purchaser address"
                        rows={3}
                      />
                    </div>

                    {/* Issuer */}
                    <div>
                      <label className="block text-sm font-medium text-secondary-700 mb-1">
                        Issuer *
                      </label>
                      <select
                        {...register('issuer_id', { required: 'Issuer is required' })}
                        className="input"
                      >
                        <option value="">Select issuer</option>
                        {issuers.map(issuer => (
                          <option key={issuer.id} value={issuer.id}>
                            {issuer.issuer_name} ({issuer.contact_number})
                          </option>
                        ))}
                      </select>
                      {errors.issuer_id && (
                        <p className="mt-1 text-sm text-danger-600">{errors.issuer_id.message}</p>
                      )}
                    </div>

                    {/* Diary */}
                    <div>
                      <label className="block text-sm font-medium text-secondary-700 mb-1">
                        <BookOpen className="h-4 w-4 inline mr-1" />
                        Diary *
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={diarySearchTerm}
                          onChange={(e) => handleDiarySearchChange(e.target.value)}
                          onFocus={handleDiaryInputFocus}
                          onBlur={handleDiaryInputBlur}
                          className="input"
                          placeholder="Enter diary number (e.g., 1, 500, 1819)"
                        />
                        {showDiarySuggestions && filteredDiaries.length > 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-white border border-secondary-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                            {filteredDiaries.map((diary) => (
                              <div
                                key={diary.id}
                                onClick={() => handleDiarySelect(diary)}
                                className="px-4 py-2 hover:bg-secondary-50 cursor-pointer border-b border-secondary-100 last:border-b-0"
                              >
                                <div className="font-medium text-secondary-900">
                                  Diary {diary.diary_number}
                                </div>
                                <div className="text-sm text-secondary-500">
                                  Tickets: {formatLotteryNumber(diary.ticket_start_range)}-{formatLotteryNumber(diary.ticket_end_range)} | 
                                  Amount: ₹{diary.expected_amount.toLocaleString()}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <input
                        type="hidden"
                        {...register('diary_id', { required: 'Diary is required' })}
                      />
                      {errors.diary_id && (
                        <p className="mt-1 text-sm text-danger-600">{errors.diary_id.message}</p>
                      )}
                      {selectedDiary && (
                        <p className="mt-1 text-sm text-success-600">
                          ✓ Selected: Diary {selectedDiary.diary_number}
                        </p>
                      )}
                    </div>

                    {/* Purchase Date */}
                    <div>
                      <label className="block text-sm font-medium text-secondary-700 mb-1">
                        <Calendar className="h-4 w-4 inline mr-1" />
                        Purchase Date *
                      </label>
                      <input
                        type="date"
                        {...register('purchase_date', { required: 'Purchase date is required' })}
                        className="input"
                      />
                      {errors.purchase_date && (
                        <p className="mt-1 text-sm text-danger-600">{errors.purchase_date.message}</p>
                      )}
                    </div>

                    {/* Amount Paid */}
                    <div>
                      <label className="block text-sm font-medium text-secondary-700 mb-1">
                        Amount Paid (₹) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        {...register('amount_paid', { 
                          required: 'Amount is required',
                          min: { value: 0, message: 'Amount must be positive' }
                        })}
                        className="input"
                        placeholder="500.00"
                      />
                      {errors.amount_paid && (
                        <p className="mt-1 text-sm text-danger-600">{errors.amount_paid.message}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-secondary-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    className="btn btn-primary sm:ml-3 sm:w-auto"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {editingTicket ? 'Update' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="btn btn-secondary sm:w-auto"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Tickets Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-medium text-secondary-900">
            Tickets ({filteredTickets.length})
          </h3>
        </div>
        <div className="card-content">
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
                  <th className="table-header-cell">Actions</th>
                </tr>
              </thead>
              <tbody className="table-body">
                {filteredTickets.map((ticket) => (
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
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleEdit(ticket)}
                          className="text-primary-600 hover:text-primary-800"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(ticket.id)}
                          className="text-danger-600 hover:text-danger-800"
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
        </div>
      </div>
    </div>
  );
};

export default TicketSales;
