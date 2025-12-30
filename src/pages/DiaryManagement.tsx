import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { supabase, DiaryAllotment, Issuer, Diary, formatLotteryNumber, TicketSale } from '../lib/supabase';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Save, 
  X,
  AlertCircle,
  CheckCircle,
  Clock,
  RotateCcw,
  User,
  Phone,
  MapPin,
  BookOpen,
  DollarSign,
  Calendar,
  Lock,
  Unlock,
  FileText,
  Download,
  FileSpreadsheet
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
// @ts-ignore - jspdf-autotable extends jsPDF prototype
import 'jspdf-autotable';

interface IssuerFormData {
  issuer_name: string;
  contact_number: string;
  address: string;
}

interface AllotmentFormData {
  diary_id: string;
  issuer_id: string;
  allotment_date: string;
  notes: string;
}

const DiaryManagement: React.FC = () => {
  const [allotments, setAllotments] = useState<DiaryAllotment[]>([]);
  const [issuers, setIssuers] = useState<Issuer[]>([]);
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'allotments' | 'issuers'>('allotments');
  const [showIssuerForm, setShowIssuerForm] = useState(false);
  const [showAllotmentForm, setShowAllotmentForm] = useState(false);
  const [editingIssuer, setEditingIssuer] = useState<Issuer | null>(null);
  const [editingAllotment, setEditingAllotment] = useState<DiaryAllotment | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [lockedRecords, setLockedRecords] = useState<Set<string>>(new Set());
  
  // Diary search states
  const [diarySearchTerm, setDiarySearchTerm] = useState('');
  const [showDiarySuggestions, setShowDiarySuggestions] = useState(false);
  const [filteredDiaries, setFilteredDiaries] = useState<Diary[]>([]);
  const [selectedDiary, setSelectedDiary] = useState<Diary | null>(null);
  
  // Report states
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedIssuerForReport, setSelectedIssuerForReport] = useState<Issuer | null>(null);
  const [reportData, setReportData] = useState<{
    tickets: TicketSale[];
    allotments: DiaryAllotment[];
    summary: {
      totalTicketsSold: number;
      totalDiariesIssued: number;
      diariesAllotted: number[];
      diariesPaid: number[];
    };
  } | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [stats, setStats] = useState({
    totalDiaries: 1819, // Fixed total diaries count
    allottedDiaries: 0,
    paidDiaries: 0,
    totalAmountCollected: 0,
    expectedAmountFromAllotted: 0
  });

  const issuerForm = useForm<IssuerFormData>();
  const allotmentForm = useForm<AllotmentFormData>();

  useEffect(() => {
    fetchData();
  }, []);

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
      console.log(`Searching for diary ${diaryNumber} on server...`);
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
        console.log(`Found diary ${diaryNumber}:`, diaryData);
        setFilteredDiaries([diaryData]);
        setShowDiarySuggestions(true);
      } else {
        console.log(`Diary ${diaryNumber} not found`);
        setFilteredDiaries([]);
        setShowDiarySuggestions(false);
      }
    } catch (error) {
      console.error('Error searching diary:', error);
      setFilteredDiaries([]);
      setShowDiarySuggestions(false);
    }
  };

  const calculateStats = (allotmentsData: DiaryAllotment[], diariesData: Diary[]) => {
    const totalDiaries = 1819; // Fixed total diaries count
    const allottedDiaries = allotmentsData.filter(a => a.status === 'allotted').length;
    const paidDiaries = allotmentsData.filter(a => a.status === 'paid').length;
    const totalAmountCollected = allotmentsData.reduce((sum, a) => sum + a.amount_collected, 0);
    const expectedAmountFromAllotted = allotmentsData
      .filter(a => a.status === 'allotted')
      .reduce((sum, a) => sum + (a.diary?.expected_amount || 0), 0);

    return {
      totalDiaries,
      allottedDiaries,
      paidDiaries,
      totalAmountCollected,
      expectedAmountFromAllotted
    };
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch all allotments with joined data (no limit - fetch all using pagination)
      let allAllotments: any[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: allotmentsPage, error: allotmentsError } = await supabase
          .from('diary_allotments')
          .select(`
            *,
            diary:diaries(*),
            issuer:issuers(*)
          `)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (allotmentsError) throw allotmentsError;

        if (allotmentsPage && allotmentsPage.length > 0) {
          allAllotments = [...allAllotments, ...allotmentsPage];
          from += pageSize;
          hasMore = allotmentsPage.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      const allotmentsData = allAllotments;

      // Fetch issuers
      const { data: issuersData, error: issuersError } = await supabase
        .from('issuers')
        .select('*')
        .order('issuer_name');

      if (issuersError) throw issuersError;

      // Fetch all diaries - use pagination to get all 1819 diaries
      let allDiaries: any[] = [];
      let diariesFrom = 0;
      const diariesPageSize = 1000;
      let hasMoreDiaries = true;

      while (hasMoreDiaries) {
        const { data: diariesPage, error: diariesError } = await supabase
          .from('diaries')
          .select('*')
          .order('diary_number')
          .gte('diary_number', 1)
          .lte('diary_number', 1819)
          .range(diariesFrom, diariesFrom + diariesPageSize - 1);

        if (diariesError) throw diariesError;

        if (diariesPage && diariesPage.length > 0) {
          allDiaries = [...allDiaries, ...diariesPage];
          diariesFrom += diariesPageSize;
          hasMoreDiaries = diariesPage.length === diariesPageSize;
        } else {
          hasMoreDiaries = false;
        }
      }

      const diariesData = allDiaries;

      setAllotments(allotmentsData || []);
      setIssuers(issuersData || []);
      setDiaries(diariesData || []);
      
      // Debug: Log the number of diaries fetched
      console.log(`Fetched ${diariesData?.length || 0} diaries from database`);
      
      // Test: Check if we have diary 1001 in the fetched data
      const diary1001 = diariesData?.find(d => d.diary_number === 1001);
      if (diary1001) {
        console.log('✅ Diary 1001 found in local data:', diary1001);
      } else {
        console.log('❌ Diary 1001 NOT found in local data');
      }
      
      // Automatically lock all paid records on load
      const paidRecordIds = (allotmentsData || [])
        .filter(allotment => allotment.status === 'paid')
        .map(allotment => allotment.id);
      setLockedRecords(new Set(paidRecordIds));
      
      // Calculate and set stats
      const calculatedStats = calculateStats(allotmentsData || [], diariesData || []);
      setStats(calculatedStats);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const onSubmitIssuer = async (data: IssuerFormData) => {
    try {
      if (editingIssuer) {
        // Update existing issuer
        const { error } = await supabase
          .from('issuers')
          .update(data)
          .eq('id', editingIssuer.id);

        if (error) throw error;
        toast.success('Issuer updated successfully');
      } else {
        // Create new issuer
        const { error } = await supabase
          .from('issuers')
          .insert([data]);

        if (error) throw error;
        toast.success('Issuer added successfully');
      }

      issuerForm.reset();
      setShowIssuerForm(false);
      setEditingIssuer(null);
      fetchData();
    } catch (error: any) {
      console.error('Error saving issuer:', error);
      toast.error('Failed to save issuer');
    }
  };

  const onSubmitAllotment = async (data: AllotmentFormData) => {
    try {
      if (editingAllotment) {
        // Update existing allotment
        const { error } = await supabase
          .from('diary_allotments')
          .update({
            diary_id: data.diary_id,
            issuer_id: data.issuer_id,
            allotment_date: data.allotment_date,
            notes: data.notes,
          })
          .eq('id', editingAllotment.id);

        if (error) throw error;
        toast.success('Allotment updated successfully');
      } else {
        // Create new allotment
        const { error } = await supabase
          .from('diary_allotments')
          .insert([{
            ...data,
            status: 'allotted',
            amount_collected: 0,
          }]);

        if (error) throw error;
        toast.success('Diary allotted successfully');
      }

      allotmentForm.reset();
      setShowAllotmentForm(false);
      setEditingAllotment(null);
      setDiarySearchTerm('');
      setSelectedDiary(null);
      fetchData();
    } catch (error: any) {
      console.error('Error saving allotment:', error);
      if (error.code === '23505') {
        toast.error('This diary is already allotted to an issuer');
      } else {
        toast.error('Failed to save allotment');
      }
    }
  };

  const handleEditIssuer = (issuer: Issuer) => {
    setEditingIssuer(issuer);
    issuerForm.setValue('issuer_name', issuer.issuer_name);
    issuerForm.setValue('contact_number', issuer.contact_number);
    issuerForm.setValue('address', issuer.address || '');
    setShowIssuerForm(true);
  };

  const handleEditAllotment = (allotment: DiaryAllotment) => {
    setEditingAllotment(allotment);
    allotmentForm.setValue('diary_id', allotment.diary_id);
    allotmentForm.setValue('issuer_id', allotment.issuer_id);
    allotmentForm.setValue('allotment_date', allotment.allotment_date);
    allotmentForm.setValue('notes', allotment.notes || '');
    
    // Set diary search term and selected diary for editing
    if (allotment.diary) {
      setSelectedDiary(allotment.diary);
      setDiarySearchTerm(`Diary ${allotment.diary.diary_number} (Tickets: ${formatLotteryNumber(allotment.diary.ticket_start_range)}-${formatLotteryNumber(allotment.diary.ticket_end_range)})`);
    }
    
    setShowAllotmentForm(true);
  };

  const handleDeleteIssuer = async (issuerId: string) => {
    if (!window.confirm('Are you sure you want to delete this issuer? This will also delete all their allotments.')) return;

    try {
      const { error } = await supabase
        .from('issuers')
        .delete()
        .eq('id', issuerId);

      if (error) throw error;
      toast.success('Issuer deleted successfully');
      fetchData();
    } catch (error) {
      console.error('Error deleting issuer:', error);
      toast.error('Failed to delete issuer');
    }
  };

  const handleDeleteAllotment = async (allotmentId: string) => {
    if (!window.confirm('Are you sure you want to delete this allotment?')) return;

    try {
      const { error } = await supabase
        .from('diary_allotments')
        .delete()
        .eq('id', allotmentId);

      if (error) throw error;
      toast.success('Allotment deleted successfully');
      fetchData();
    } catch (error) {
      console.error('Error deleting allotment:', error);
      toast.error('Failed to delete allotment');
    }
  };

  const updateAllotmentStatus = async (allotmentId: string, status: DiaryAllotment['status']) => {
    try {
      const updateData: any = { status };
      
      // Set amount collected based on status
      if (status === 'paid') {
        updateData.amount_collected = 11000;
        // Automatically lock paid records immediately
        setLockedRecords(prev => new Set(prev).add(allotmentId));
      } else {
        // Reset amount collected to 0 for all other statuses (allotted, fully_sold, returned)
        updateData.amount_collected = 0;
        // Unlock when status changes from paid
        setLockedRecords(prev => {
          const newSet = new Set(prev);
          newSet.delete(allotmentId);
          return newSet;
        });
      }
      
      const { error } = await supabase
        .from('diary_allotments')
        .update(updateData)
        .eq('id', allotmentId);

      if (error) throw error;
      
      const statusMessage = status === 'paid' 
        ? ', amount collected set to ₹11,000, and record locked' 
        : ' and amount collected reset to ₹0';
      
      toast.success(`Status updated to ${status}${statusMessage}`);
      
      // Update local state immediately for better UX
      setAllotments(prev => prev.map(allotment => 
        allotment.id === allotmentId 
          ? { ...allotment, status, amount_collected: status === 'paid' ? 11000 : 0 }
          : allotment
      ));
      
      // Also fetch data to ensure consistency
      fetchData();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  const toggleLock = (allotmentId: string) => {
    setLockedRecords(prev => {
      const newSet = new Set(prev);
      if (newSet.has(allotmentId)) {
        newSet.delete(allotmentId);
        toast.success('Record unlocked - status can now be changed');
      } else {
        newSet.add(allotmentId);
        toast.success('Record locked - status is protected from accidental changes');
      }
      return newSet;
    });
  };

  const isRecordLocked = (allotmentId: string) => {
    return lockedRecords.has(allotmentId);
  };

  // Diary selection handlers
  const handleDiarySearchChange = (value: string) => {
    setDiarySearchTerm(value);
    if (value.trim() === '') {
      setSelectedDiary(null);
      allotmentForm.setValue('diary_id', '');
    }
  };

  const handleDiarySelect = (diary: Diary) => {
    setSelectedDiary(diary);
    setDiarySearchTerm(`Diary ${diary.diary_number} (Tickets: ${formatLotteryNumber(diary.ticket_start_range)}-${formatLotteryNumber(diary.ticket_end_range)})`);
    setShowDiarySuggestions(false);
    allotmentForm.setValue('diary_id', diary.id);
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

  const shouldDisableStatusChange = (allotment: DiaryAllotment) => {
    return allotment.status === 'paid' && isRecordLocked(allotment.id);
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

  const handleViewReport = async (issuer: Issuer) => {
    try {
      setLoadingReport(true);
      setSelectedIssuerForReport(issuer);
      setShowReportModal(true);

      // Fetch all tickets for this issuer (no limit - fetch all)
      let allTickets: any[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: ticketsPage, error: ticketsError } = await supabase
          .from('ticket_sales')
          .select(`
            *,
            issuer:issuers(*),
            diary:diaries(*)
          `)
          .eq('issuer_id', issuer.id)
          .order('lottery_number', { ascending: true })
          .range(from, from + pageSize - 1);

        if (ticketsError) throw ticketsError;

        if (ticketsPage && ticketsPage.length > 0) {
          allTickets = [...allTickets, ...ticketsPage];
          from += pageSize;
          hasMore = ticketsPage.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      const ticketsData = allTickets;

      // Fetch all allotments for this issuer
      const { data: allotmentsData, error: allotmentsError } = await supabase
        .from('diary_allotments')
        .select(`
          *,
          diary:diaries(*)
        `)
        .eq('issuer_id', issuer.id)
        .order('allotment_date', { ascending: true });

      if (allotmentsError) throw allotmentsError;

      // Calculate summary
      const diariesAllotted = (allotmentsData || []).map(a => a.diary?.diary_number).filter(Boolean) as number[];
      const diariesPaid = (allotmentsData || [])
        .filter(a => a.status === 'paid')
        .map(a => a.diary?.diary_number)
        .filter(Boolean) as number[];
      
      // Total diaries issued = diaries allotted + diaries paid (unique count)
      const allDiariesIssued = [...new Set([...diariesAllotted, ...diariesPaid])];

      setReportData({
        tickets: ticketsData || [],
        allotments: allotmentsData || [],
        summary: {
          totalTicketsSold: ticketsData?.length || 0,
          totalDiariesIssued: allDiariesIssued.length,
          diariesAllotted,
          diariesPaid
        }
      });
    } catch (error) {
      console.error('Error fetching report data:', error);
      toast.error('Failed to load report data');
    } finally {
      setLoadingReport(false);
    }
  };

  const exportToExcel = () => {
    if (!reportData || !selectedIssuerForReport) return;

    const wsData = [
      ['Issuer Report'],
      ['Issuer Name:', selectedIssuerForReport.issuer_name],
      ['Contact:', selectedIssuerForReport.contact_number],
      [''],
      ['Summary'],
      ['Total Tickets Sold:', reportData.summary.totalTicketsSold],
      ['Total Diaries Issued:', reportData.summary.totalDiariesIssued],
      ['Diaries Allotted:', reportData.summary.diariesAllotted.join(', ')],
      ['Diaries Paid:', reportData.summary.diariesPaid.join(', ')],
      [''],
      ['Detailed Ticket Information'],
      ['Lottery Number', 'Purchaser Name', 'Contact', 'Address', 'Diary Number', 'Purchase Date', 'Amount Paid']
    ];

    // Add ticket data
    reportData.tickets.forEach(ticket => {
      wsData.push([
        formatLotteryNumber(ticket.lottery_number),
        ticket.purchaser_name,
        ticket.purchaser_contact,
        ticket.purchaser_address || '',
        ticket.diary?.diary_number?.toString() || '',
        new Date(ticket.purchase_date).toLocaleDateString('en-IN'),
        `₹${ticket.amount_paid}`
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Issuer Report');

    const fileName = `${selectedIssuerForReport.issuer_name}_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success('Report exported to Excel');
  };

  const exportToPDF = () => {
    if (!reportData || !selectedIssuerForReport) {
      toast.error('No report data available');
      return;
    }

    try {
      // Initialize PDF document
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      let currentPage = 1;
      const pageHeight = doc.internal.pageSize.getHeight();
      const pageWidth = doc.internal.pageSize.getWidth();
      let yPos = 20;
      const margin = 14;
      const lineHeight = 7;
      
      // Helper function to add new page
      const addNewPage = () => {
        doc.addPage();
        currentPage++;
        yPos = 20;
        // Add page number
        doc.setFontSize(10);
        doc.text(
          `Page ${currentPage}`,
          pageWidth / 2,
          pageHeight - 10,
          { align: 'center' }
        );
        yPos = 20;
      };
      
      // Helper function to check if we need a new page
      const checkPageBreak = (requiredSpace: number) => {
        if (yPos + requiredSpace > pageHeight - 20) {
          addNewPage();
        }
      };
      
      // Title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Issuer Report', margin, yPos);
      yPos += 10;
      
      // Issuer Info
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      checkPageBreak(15);
      doc.text(`Issuer Name: ${selectedIssuerForReport.issuer_name}`, margin, yPos);
      yPos += lineHeight;
      doc.text(`Contact: ${selectedIssuerForReport.contact_number}`, margin, yPos);
      yPos += 10;
      
      // Summary Section
      checkPageBreak(30);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Summary', margin, yPos);
      yPos += 8;
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Tickets Sold: ${reportData.summary.totalTicketsSold}`, margin, yPos);
      yPos += lineHeight;
      doc.text(`Total Diaries Issued: ${reportData.summary.totalDiariesIssued}`, margin, yPos);
      yPos += lineHeight;
      
      // Diaries Allotted
      const allottedText = `Diaries Allotted: ${reportData.summary.diariesAllotted.length > 0 ? reportData.summary.diariesAllotted.join(', ') : 'None'}`;
      const allottedLines = doc.splitTextToSize(allottedText, pageWidth - (margin * 2));
      
      allottedLines.forEach((line: string) => {
        checkPageBreak(lineHeight);
        doc.text(line, margin, yPos);
        yPos += lineHeight;
      });
      
      // Diaries Paid
      const paidText = `Diaries Paid: ${reportData.summary.diariesPaid.length > 0 ? reportData.summary.diariesPaid.join(', ') : 'None'}`;
      const paidLines = doc.splitTextToSize(paidText, pageWidth - (margin * 2));
      
      paidLines.forEach((line: string) => {
        checkPageBreak(lineHeight);
        doc.text(line, margin, yPos);
        yPos += lineHeight;
      });
      
      yPos += 10;

      // Detailed Ticket Table
      const ticketData = reportData.tickets.map(ticket => {
        const address = (ticket.purchaser_address || 'N/A');
        const truncatedAddress = address.length > 30 ? address.substring(0, 27) + '...' : address;
        
        return [
          formatLotteryNumber(ticket.lottery_number),
          (ticket.purchaser_name || 'N/A').substring(0, 25),
          (ticket.purchaser_contact || 'N/A').substring(0, 15),
          truncatedAddress,
          ticket.diary?.diary_number?.toString() || 'N/A',
          new Date(ticket.purchase_date).toLocaleDateString('en-IN'),
          `₹${ticket.amount_paid}`
        ];
      });

      if (ticketData.length > 0) {
        checkPageBreak(30);
        
        // Check if autoTable is available
        if (typeof (doc as any).autoTable === 'function') {
          try {
            (doc as any).autoTable({
            startY: yPos,
            head: [['Lottery #', 'Purchaser', 'Contact', 'Address', 'Diary', 'Date', 'Amount']],
            body: ticketData,
            theme: 'striped',
            headStyles: { fillColor: [59, 130, 246] },
            styles: { fontSize: 7 },
            margin: { left: margin, right: margin },
            columnStyles: {
              0: { cellWidth: 20 },
              1: { cellWidth: 35 },
              2: { cellWidth: 30 },
              3: { cellWidth: 40 },
              4: { cellWidth: 15 },
              5: { cellWidth: 25 },
              6: { cellWidth: 20 }
            },
            didDrawPage: (data: any) => {
              // Add page number on each page
              doc.setFontSize(10);
              doc.text(
                `Page ${data.pageNumber}`,
                pageWidth / 2,
                pageHeight - 10,
                { align: 'center' }
              );
            }
            });
          } catch (tableError) {
            console.error('Error creating ticket table:', tableError);
            // Fallback: create a simpler table without autoTable
            checkPageBreak(20);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('Detailed Ticket Information:', margin, yPos);
            yPos += lineHeight;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            
            ticketData.forEach((row) => {
              checkPageBreak(lineHeight * 2);
              doc.text(`Lottery #: ${row[0]}`, margin, yPos);
              yPos += lineHeight;
              doc.text(`Purchaser: ${row[1]} | Contact: ${row[2]} | Amount: ${row[6]}`, margin + 5, yPos);
              yPos += lineHeight + 2;
            });
          }
        } else {
          // autoTable not available, use fallback
          console.warn('autoTable function not available, using fallback');
          checkPageBreak(20);
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.text('Detailed Ticket Information:', margin, yPos);
          yPos += lineHeight;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          
          ticketData.forEach((row) => {
            checkPageBreak(lineHeight * 2);
            doc.text(`Lottery #: ${row[0]}`, margin, yPos);
            yPos += lineHeight;
            doc.text(`Purchaser: ${row[1]} | Contact: ${row[2]} | Amount: ${row[6]}`, margin + 5, yPos);
            yPos += lineHeight + 2;
          });
        }
      } else {
        checkPageBreak(lineHeight);
        doc.setFontSize(11);
        doc.text('No tickets found for this issuer', margin, yPos);
      }

      // Add page number to first page
      doc.setPage(1);
      doc.setFontSize(10);
      doc.text(
        'Page 1',
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );

      // Save the PDF
      const fileName = `${selectedIssuerForReport.issuer_name.replace(/[^a-z0-9]/gi, '_')}_Report_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      toast.success('Report exported to PDF successfully');
    } catch (error: any) {
      console.error('Error exporting PDF:', error);
      console.error('Error details:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name
      });
      toast.error(`Failed to export PDF: ${error?.message || 'Unknown error'}`);
    }
  };

  const filteredAllotments = allotments.filter(allotment =>
    allotment.diary?.diary_number.toString().includes(searchTerm) ||
    allotment.issuer?.issuer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    allotment.issuer?.contact_number.includes(searchTerm) ||
    allotment.status.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredIssuers = issuers.filter(issuer =>
    issuer.issuer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    issuer.contact_number.includes(searchTerm) ||
    issuer.address?.toLowerCase().includes(searchTerm.toLowerCase())
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
          <h1 className="text-2xl font-bold text-secondary-900">Diary Management</h1>
          <p className="mt-1 text-sm text-secondary-500">
            Manage diary allotments and issuer information
          </p>
        </div>
        <div className="flex space-x-3">
          {activeTab === 'allotments' && (
            <button
              onClick={() => setShowAllotmentForm(true)}
              className="btn btn-primary"
            >
              <Plus className="h-4 w-4 mr-2" />
              Allot Diary
            </button>
          )}
          {activeTab === 'issuers' && (
            <button
              onClick={() => setShowIssuerForm(true)}
              className="btn btn-primary"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Issuer
            </button>
          )}
        </div>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="card">
          <div className="card-content">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <BookOpen className="h-8 w-8 text-primary-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-secondary-900">Total Diaries</h3>
                <p className="text-2xl font-bold text-primary-600">{stats.totalDiaries}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-content">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Clock className="h-8 w-8 text-warning-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-secondary-900">Allotted Diaries</h3>
                <p className="text-2xl font-bold text-warning-600">{stats.allottedDiaries}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-content">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircle className="h-8 w-8 text-success-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-secondary-900">Paid Diaries</h3>
                <p className="text-2xl font-bold text-success-600">{stats.paidDiaries}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-content">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DollarSign className="h-8 w-8 text-success-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-secondary-900">Total Amount Collected</h3>
                <p className="text-2xl font-bold text-success-600">₹{stats.totalAmountCollected.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-content">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DollarSign className="h-8 w-8 text-warning-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-secondary-900">Expected from Allotted</h3>
                <p className="text-2xl font-bold text-warning-600">₹{stats.expectedAmountFromAllotted.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>


      </div>

      {/* Tabs */}
      <div className="border-b border-secondary-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('allotments')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'allotments'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'
            }`}
          >
            Diary Allotments ({allotments.length})
          </button>
          <button
            onClick={() => setActiveTab('issuers')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'issuers'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'
            }`}
          >
            Issuers ({issuers.length})
          </button>
        </nav>
      </div>

      {/* Search */}
      <div className="flex items-center space-x-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-secondary-400" />
          <input
            type="text"
            placeholder={`Search ${activeTab}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      {/* Issuer Form Modal */}
      {showIssuerForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-secondary-900 bg-opacity-50 transition-opacity" onClick={() => setShowIssuerForm(false)}></div>
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-strong transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <form onSubmit={issuerForm.handleSubmit(onSubmitIssuer)}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-secondary-900">
                      {editingIssuer ? 'Edit Issuer' : 'Add New Issuer'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowIssuerForm(false)}
                      className="text-secondary-400 hover:text-secondary-600"
                    >
                      <X className="h-6 w-6" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-secondary-700 mb-1">
                        <User className="h-4 w-4 inline mr-1" />
                        Issuer Name *
                      </label>
                      <input
                        type="text"
                        {...issuerForm.register('issuer_name', { required: 'Issuer name is required' })}
                        className="input"
                        placeholder="Enter issuer name"
                      />
                      {issuerForm.formState.errors.issuer_name && (
                        <p className="mt-1 text-sm text-danger-600">{issuerForm.formState.errors.issuer_name.message}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-secondary-700 mb-1">
                        <Phone className="h-4 w-4 inline mr-1" />
                        Contact Number *
                      </label>
                      <input
                        type="tel"
                        {...issuerForm.register('contact_number', { required: 'Contact number is required' })}
                        className="input"
                        placeholder="Enter contact number"
                      />
                      {issuerForm.formState.errors.contact_number && (
                        <p className="mt-1 text-sm text-danger-600">{issuerForm.formState.errors.contact_number.message}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-secondary-700 mb-1">
                        <MapPin className="h-4 w-4 inline mr-1" />
                        Address
                      </label>
                      <textarea
                        {...issuerForm.register('address')}
                        className="input min-h-[80px] resize-none"
                        placeholder="Enter issuer address"
                        rows={3}
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-secondary-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    className="btn btn-primary sm:ml-3 sm:w-auto"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {editingIssuer ? 'Update' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowIssuerForm(false)}
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

      {/* Allotment Form Modal */}
      {showAllotmentForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-secondary-900 bg-opacity-50 transition-opacity" onClick={() => setShowAllotmentForm(false)}></div>
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-strong transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <form onSubmit={allotmentForm.handleSubmit(onSubmitAllotment)}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-secondary-900">
                      {editingAllotment ? 'Edit Allotment' : 'Allot Diary'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAllotmentForm(false);
                        setDiarySearchTerm('');
                        setSelectedDiary(null);
                        setShowDiarySuggestions(false);
                      }}
                      className="text-secondary-400 hover:text-secondary-600"
                    >
                      <X className="h-6 w-6" />
                    </button>
                  </div>

                  <div className="space-y-4">
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
                        {...allotmentForm.register('diary_id', { required: 'Diary is required' })}
                      />
                      {allotmentForm.formState.errors.diary_id && (
                        <p className="mt-1 text-sm text-danger-600">{allotmentForm.formState.errors.diary_id.message}</p>
                      )}
                      {selectedDiary && (
                        <p className="mt-1 text-sm text-success-600">
                          ✓ Selected: Diary {selectedDiary.diary_number}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-secondary-700 mb-1">
                        <User className="h-4 w-4 inline mr-1" />
                        Issuer *
                      </label>
                      <select
                        {...allotmentForm.register('issuer_id', { required: 'Issuer is required' })}
                        className="input"
                      >
                        <option value="">Select issuer</option>
                        {issuers.map(issuer => (
                          <option key={issuer.id} value={issuer.id}>
                            {issuer.issuer_name} ({issuer.contact_number})
                          </option>
                        ))}
                      </select>
                      {allotmentForm.formState.errors.issuer_id && (
                        <p className="mt-1 text-sm text-danger-600">{allotmentForm.formState.errors.issuer_id.message}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-secondary-700 mb-1">
                        <Calendar className="h-4 w-4 inline mr-1" />
                        Allotment Date *
                      </label>
                      <input
                        type="date"
                        {...allotmentForm.register('allotment_date', { required: 'Allotment date is required' })}
                        className="input"
                      />
                      {allotmentForm.formState.errors.allotment_date && (
                        <p className="mt-1 text-sm text-danger-600">{allotmentForm.formState.errors.allotment_date.message}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-secondary-700 mb-1">
                        Notes
                      </label>
                      <textarea
                        {...allotmentForm.register('notes')}
                        className="input min-h-[80px] resize-none"
                        placeholder="Enter any notes about this allotment"
                        rows={3}
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-secondary-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    className="btn btn-primary sm:ml-3 sm:w-auto"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {editingAllotment ? 'Update' : 'Allot'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAllotmentForm(false);
                      setDiarySearchTerm('');
                      setSelectedDiary(null);
                      setShowDiarySuggestions(false);
                    }}
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

      {/* Content */}
      {activeTab === 'allotments' ? (
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-secondary-900">
              Diary Allotments ({filteredAllotments.length})
            </h3>
          </div>
          <div className="card-content">
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
                    <th className="table-header-cell">Actions</th>
                  </tr>
                </thead>
                <tbody className="table-body">
                  {filteredAllotments.map((allotment) => (
                    <tr key={allotment.id} className="table-row">
                      <td className="table-cell">
                        <span className="badge badge-secondary">
                          Diary {allotment.diary?.diary_number}
                        </span>
                        <div className="text-xs text-secondary-500 mt-1">
                          Tickets: {allotment.diary ? formatLotteryNumber(allotment.diary.ticket_start_range) : 'N/A'}-{allotment.diary ? formatLotteryNumber(allotment.diary.ticket_end_range) : 'N/A'}
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
                      <td className="table-cell">
                        <div className="flex items-center space-x-2">
                          <select
                            value={allotment.status}
                            onChange={(e) => updateAllotmentStatus(allotment.id, e.target.value as DiaryAllotment['status'])}
                            disabled={shouldDisableStatusChange(allotment)}
                            className={`text-xs border border-secondary-300 rounded px-2 py-1 ${
                              shouldDisableStatusChange(allotment) 
                                ? 'bg-gray-100 text-gray-500 cursor-not-allowed' 
                                : 'bg-white'
                            }`}
                          >
                            <option value="allotted">Allotted</option>
                            <option value="fully_sold">Fully Sold</option>
                            <option value="paid">Paid</option>
                            <option value="returned">Returned</option>
                          </select>
                          <button
                            onClick={() => toggleLock(allotment.id)}
                            className={`${
                              isRecordLocked(allotment.id)
                                ? 'text-warning-600 hover:text-warning-800'
                                : 'text-secondary-600 hover:text-secondary-800'
                            }`}
                            title={
                              isRecordLocked(allotment.id) 
                                ? 'Unlock to allow status changes' 
                                : 'Lock to prevent accidental status changes'
                            }
                          >
                            {isRecordLocked(allotment.id) ? (
                              <Lock className="h-4 w-4" />
                            ) : (
                              <Unlock className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleEditAllotment(allotment)}
                            className="text-primary-600 hover:text-primary-800"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteAllotment(allotment.id)}
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
      ) : (
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-secondary-900">
              Issuers ({filteredIssuers.length})
            </h3>
          </div>
          <div className="card-content">
            <div className="overflow-x-auto">
              <table className="table">
                <thead className="table-header">
                  <tr>
                    <th className="table-header-cell">Name</th>
                    <th className="table-header-cell">Contact</th>
                    <th className="table-header-cell">Address</th>
                    <th className="table-header-cell">Created</th>
                    <th className="table-header-cell">Actions</th>
                  </tr>
                </thead>
                <tbody className="table-body">
                  {filteredIssuers.map((issuer) => (
                    <tr key={issuer.id} className="table-row">
                      <td className="table-cell font-medium">{issuer.issuer_name}</td>
                      <td className="table-cell font-mono">{issuer.contact_number}</td>
                      <td className="table-cell">
                        {issuer.address ? (
                          <div className="text-sm text-secondary-600 truncate max-w-xs">
                            {issuer.address}
                          </div>
                        ) : (
                          <span className="text-secondary-400">No address</span>
                        )}
                      </td>
                      <td className="table-cell">
                        {new Date(issuer.created_at).toLocaleDateString('en-IN')}
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleViewReport(issuer)}
                            className="text-success-600 hover:text-success-800"
                            title="View Report"
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleEditIssuer(issuer)}
                            className="text-primary-600 hover:text-primary-800"
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteIssuer(issuer.id)}
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
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && selectedIssuerForReport && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-secondary-900 bg-opacity-50 transition-opacity" onClick={() => setShowReportModal(false)}></div>
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-strong transform transition-all sm:my-8 sm:align-middle sm:max-w-7xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-secondary-900">
                    Issuer Report - {selectedIssuerForReport.issuer_name}
                  </h3>
                  <div className="flex items-center space-x-2">
                    {reportData && (
                      <>
                        <button
                          onClick={exportToExcel}
                          className="btn btn-success btn-sm"
                        >
                          <FileSpreadsheet className="h-4 w-4 mr-2" />
                          Export Excel
                        </button>
                        <button
                          onClick={exportToPDF}
                          className="btn btn-primary btn-sm"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Export PDF
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => {
                        setShowReportModal(false);
                        setSelectedIssuerForReport(null);
                        setReportData(null);
                      }}
                      className="text-secondary-400 hover:text-secondary-600"
                    >
                      <X className="h-6 w-6" />
                    </button>
                  </div>
                </div>

                {loadingReport ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
                  </div>
                ) : reportData ? (
                  <div className="space-y-6">
                    {/* Summary Section */}
                    <div className="bg-secondary-50 rounded-lg p-4">
                      <h4 className="text-md font-semibold text-secondary-900 mb-4">Summary</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-white rounded p-3">
                          <p className="text-sm text-secondary-600">Total Tickets Sold</p>
                          <p className="text-2xl font-bold text-secondary-900">{reportData.summary.totalTicketsSold}</p>
                        </div>
                        <div className="bg-white rounded p-3">
                          <p className="text-sm text-secondary-600">Total Diaries Issued</p>
                          <p className="text-2xl font-bold text-primary-600">{reportData.summary.totalDiariesIssued}</p>
                        </div>
                        <div className="bg-white rounded p-3">
                          <p className="text-sm text-secondary-600">Diaries Allotted</p>
                          <p className="text-lg font-semibold text-secondary-900">
                            {reportData.summary.diariesAllotted.length > 0 
                              ? reportData.summary.diariesAllotted.join(', ')
                              : 'None'}
                          </p>
                        </div>
                        <div className="bg-white rounded p-3">
                          <p className="text-sm text-secondary-600">Diaries Paid</p>
                          <p className="text-lg font-semibold text-success-600">
                            {reportData.summary.diariesPaid.length > 0 
                              ? reportData.summary.diariesPaid.join(', ')
                              : 'None'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Detailed Ticket Information */}
                    <div>
                      <h4 className="text-md font-semibold text-secondary-900 mb-4">Detailed Ticket Information</h4>
                      <div className="overflow-x-auto">
                        <table className="table">
                          <thead className="table-header">
                            <tr>
                              <th className="table-header-cell">Lottery #</th>
                              <th className="table-header-cell">Purchaser Name</th>
                              <th className="table-header-cell">Contact</th>
                              <th className="table-header-cell">Address</th>
                              <th className="table-header-cell">Diary</th>
                              <th className="table-header-cell">Purchase Date</th>
                              <th className="table-header-cell">Amount Paid</th>
                            </tr>
                          </thead>
                          <tbody className="table-body">
                            {reportData.tickets.length > 0 ? (
                              reportData.tickets.map((ticket) => (
                                <tr key={ticket.id} className="table-row">
                                  <td className="table-cell font-mono font-medium">
                                    {formatLotteryNumber(ticket.lottery_number)}
                                  </td>
                                  <td className="table-cell font-medium">{ticket.purchaser_name}</td>
                                  <td className="table-cell font-mono">{ticket.purchaser_contact}</td>
                                  <td className="table-cell">
                                    {ticket.purchaser_address || <span className="text-secondary-400">No address</span>}
                                  </td>
                                  <td className="table-cell">
                                    <span className="badge badge-secondary">
                                      Diary {ticket.diary?.diary_number || 'N/A'}
                                    </span>
                                  </td>
                                  <td className="table-cell">
                                    {new Date(ticket.purchase_date).toLocaleDateString('en-IN')}
                                  </td>
                                  <td className="table-cell font-medium">₹{ticket.amount_paid}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={7} className="table-cell text-center text-secondary-500 py-8">
                                  No tickets found for this issuer
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-secondary-500">
                    No report data available
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiaryManagement;
