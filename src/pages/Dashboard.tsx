import React, { useState, useEffect } from 'react';
import { supabase, DashboardStats, IssuerPerformance, getMissingTickets, MissingTicketsResult } from '../lib/supabase';
import { 
  Ticket, 
  DollarSign, 
  BookOpen, 
  TrendingUp, 
  Users,
  AlertCircle,
  CheckCircle,
  Clock,
  RotateCcw,
  Search,
  X,
  Download,
  FileSpreadsheet
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import * as XLSX from 'xlsx';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    total_tickets_sold: 0,
    total_revenue: 0,
    diaries_allotted: 0,
    diaries_fully_sold: 0,
    diaries_paid: 0,
    diaries_returned: 0,
    diaries_remaining: 0,
    total_amount_collected: 0,
    expected_amount_from_allotted: 0
  });
  const [issuerPerformance, setIssuerPerformance] = useState<IssuerPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingTickets, setMissingTickets] = useState<MissingTicketsResult | null>(null);
  const [loadingMissingTickets, setLoadingMissingTickets] = useState(false);
  const [showMissingTickets, setShowMissingTickets] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch dashboard stats
      const { data: statsData, error: statsError } = await supabase
        .from('dashboard_stats')
        .select('*')
        .single();

      if (statsError) {
        console.error('Error fetching dashboard stats:', statsError);
        // Use default values if view doesn't exist yet
        setStats({
          total_tickets_sold: 0,
          total_revenue: 0,
          diaries_allotted: 0,
          diaries_fully_sold: 0,
          diaries_paid: 0,
          diaries_returned: 0,
          diaries_remaining: 0,
          total_amount_collected: 0,
          expected_amount_from_allotted: 0
        });
      } else {
        setStats(statsData || {
          total_tickets_sold: 0,
          total_revenue: 0,
          diaries_allotted: 0,
          diaries_fully_sold: 0,
          diaries_paid: 0,
          diaries_returned: 0,
          diaries_remaining: 0,
          total_amount_collected: 0,
          expected_amount_from_allotted: 0
        });
      }

      // Fetch issuer performance
      const { data: issuerData, error: issuerError } = await supabase
        .from('issuer_performance')
        .select('*')
        .order('total_collected', { ascending: false });

      if (issuerError) {
        console.error('Error fetching issuer performance:', issuerError);
        setIssuerPerformance([]);
      } else {
        setIssuerPerformance(issuerData || []);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckMissingTickets = async () => {
    try {
      setLoadingMissingTickets(true);
      const result = await getMissingTickets();
      setMissingTickets(result);
      setShowMissingTickets(true);
    } catch (error) {
      console.error('Error checking missing tickets:', error);
      alert('Failed to fetch missing tickets. Please try again.');
    } finally {
      setLoadingMissingTickets(false);
    }
  };

  const handleExportToExcel = () => {
    if (!missingTickets) return;

    try {
      // Create workbook
      const workbook = XLSX.utils.book_new();

      // Sheet 1: Summary
      const summaryData = [
        ['Missing Lottery Tickets Report'],
        ['Generated Date', new Date().toLocaleString()],
        ['Total Missing Tickets', missingTickets.total_missing],
        ['Total Diaries with Missing Tickets', missingTickets.grouped_by_diary.length],
        [],
        ['Diary Number', 'Missing Count', 'Missing Ticket Numbers']
      ];

      // Add data rows
      missingTickets.grouped_by_diary.forEach(group => {
        summaryData.push([
          group.diary_number,
          group.missing_count,
          group.missing_numbers.map(n => n.toString().padStart(5, '0')).join(', ')
        ]);
      });

      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      
      // Set column widths
      summarySheet['!cols'] = [
        { wch: 15 }, // Diary Number
        { wch: 15 }, // Missing Count
        { wch: 100 } // Missing Ticket Numbers
      ];

      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary by Diary');

      // Sheet 2: Detailed list (all missing tickets)
      const detailedData = [
        ['Lottery Number', 'Diary Number', 'Formatted Lottery Number']
      ];

      missingTickets.missing_tickets.forEach(ticket => {
        detailedData.push([
          ticket.lottery_number,
          ticket.diary_number,
          ticket.lottery_number.toString().padStart(5, '0')
        ]);
      });

      const detailedSheet = XLSX.utils.aoa_to_sheet(detailedData);
      
      // Set column widths
      detailedSheet['!cols'] = [
        { wch: 18 }, // Lottery Number
        { wch: 15 }, // Diary Number
        { wch: 25 }  // Formatted Lottery Number
      ];

      XLSX.utils.book_append_sheet(workbook, detailedSheet, 'All Missing Tickets');

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const filename = `Missing_Lottery_Tickets_${timestamp}.xlsx`;

      // Write file
      XLSX.writeFile(workbook, filename);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Failed to export to Excel. Please try again.');
    }
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'allotted':
        return 'text-warning-600';
      case 'fully_sold':
        return 'text-success-600';
      case 'paid':
        return 'text-success-600';
      case 'returned':
        return 'text-danger-600';
      default:
        return 'text-secondary-600';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        <span className="ml-3 text-secondary-600">Loading dashboard...</span>
      </div>
    );
  }

  const pieData = [
    { name: 'Allotted', value: stats?.diaries_allotted || 0, color: '#f59e0b' },
    { name: 'Fully Sold', value: stats?.diaries_fully_sold || 0, color: '#22c55e' },
    { name: 'Paid', value: stats?.diaries_paid || 0, color: '#16a34a' },
    { name: 'Returned', value: stats?.diaries_returned || 0, color: '#ef4444' },
  ];

  const topIssuers = issuerPerformance
    .map(issuer => ({
      ...issuer,
      total_amount_received: (issuer.diaries_paid || 0) * 11000
    }))
    .sort((a, b) => b.total_amount_received - a.total_amount_received)
    .slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900">Dashboard</h1>
          <p className="mt-1 text-sm text-secondary-500">
            Overview of lottery ticket sales and diary management
          </p>
        </div>
        <button
          onClick={handleCheckMissingTickets}
          disabled={loadingMissingTickets}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Search className="h-4 w-4" />
          {loadingMissingTickets ? 'Checking...' : 'Check Missing Tickets'}
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="stat-card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Ticket className="h-8 w-8 text-primary-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="stat-label">Tickets Sold</dt>
                <dd className="stat-value">{stats?.total_tickets_sold?.toLocaleString() || '0'}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <DollarSign className="h-8 w-8 text-success-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="stat-label">Total Revenue</dt>
                <dd className="stat-value">₹{stats?.total_revenue?.toLocaleString() || '0'}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <BookOpen className="h-8 w-8 text-warning-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="stat-label">Diaries Allotted</dt>
                <dd className="stat-value">{stats?.diaries_allotted || '0'}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <TrendingUp className="h-8 w-8 text-primary-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="stat-label">Collection Rate</dt>
                <dd className="stat-value">
                  {stats?.expected_amount_from_allotted > 0 
                    ? Math.round(((stats?.total_amount_collected || 0) / (stats?.expected_amount_from_allotted || 1)) * 100)
                    : 0}%
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CheckCircle className="h-8 w-8 text-success-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="stat-label">Paid Diaries</dt>
                <dd className="stat-value">{stats?.diaries_paid || '0'}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Clock className="h-8 w-8 text-warning-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="stat-label">Remaining Diaries</dt>
                <dd className="stat-value">{stats?.diaries_remaining || '0'}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Diary Status Pie Chart */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-secondary-900">Diary Status Distribution</h3>
          </div>
          <div className="card-content">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Top Issuers Bar Chart */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-secondary-900">Top Issuers by Total Amount Received</h3>
          </div>
          <div className="card-content">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topIssuers}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="issuer_name" 
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    fontSize={12}
                  />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Total Amount Received']}
                  />
                  <Bar dataKey="total_amount_received" fill="#0ea5e9" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Missing Tickets Section */}
      {showMissingTickets && missingTickets && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h3 className="text-lg font-medium text-secondary-900">
              Missing Lottery Tickets (1-39999)
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportToExcel}
                className="flex items-center gap-2 px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 transition-colors"
                title="Download as Excel"
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span>Export to Excel</span>
              </button>
              <button
                onClick={() => setShowMissingTickets(false)}
                className="p-1 text-secondary-500 hover:text-secondary-700 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="card-content">
            <div className="mb-4 p-4 bg-warning-50 border border-warning-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-warning-600" />
                  <span className="text-lg font-semibold text-warning-900">
                    Total Missing Tickets: {missingTickets.total_missing.toLocaleString()}
                  </span>
                </div>
                <button
                  onClick={handleExportToExcel}
                  className="flex items-center gap-2 px-3 py-1.5 bg-success-600 text-white text-sm rounded-lg hover:bg-success-700 transition-colors"
                  title="Download as Excel"
                >
                  <Download className="h-4 w-4" />
                  <span>Download Excel</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="mb-4 text-sm text-secondary-600">
                Showing {missingTickets.grouped_by_diary.length} diaries with missing tickets
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="table">
                  <thead className="table-header sticky top-0">
                    <tr>
                      <th className="table-header-cell">Diary Number</th>
                      <th className="table-header-cell">Missing Count</th>
                      <th className="table-header-cell">Missing Ticket Numbers</th>
                    </tr>
                  </thead>
                  <tbody className="table-body">
                    {missingTickets.grouped_by_diary.map((group) => (
                      <tr key={group.diary_number} className="table-row">
                        <td className="table-cell font-medium">{group.diary_number}</td>
                        <td className="table-cell">{group.missing_count}</td>
                        <td className="table-cell">
                          <div className="flex flex-wrap gap-1 max-w-2xl">
                            {group.missing_numbers.length <= 50 ? (
                              group.missing_numbers.map((num) => (
                                <span
                                  key={num}
                                  className="inline-block px-2 py-1 text-xs bg-secondary-100 text-secondary-700 rounded"
                                >
                                  {num.toString().padStart(5, '0')}
                                </span>
                              ))
                            ) : (
                              <>
                                {group.missing_numbers.slice(0, 50).map((num) => (
                                  <span
                                    key={num}
                                    className="inline-block px-2 py-1 text-xs bg-secondary-100 text-secondary-700 rounded"
                                  >
                                    {num.toString().padStart(5, '0')}
                                  </span>
                                ))}
                                <span className="inline-block px-2 py-1 text-xs bg-secondary-200 text-secondary-800 rounded font-medium">
                                  ... and {group.missing_numbers.length - 50} more
                                </span>
                              </>
                            )}
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
      )}

      {/* Issuer Performance Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-medium text-secondary-900">Issuer Performance</h3>
        </div>
        <div className="card-content">
          <div className="overflow-x-auto">
            <table className="table">
              <thead className="table-header">
                <tr>
                  <th className="table-header-cell">Issuer Name</th>
                  <th className="table-header-cell">Contact</th>
                  <th className="table-header-cell">Diaries Allotted</th>
                  <th className="table-header-cell">Diaries Paid</th>
                  <th className="table-header-cell">Tickets Sold</th>
                  <th className="table-header-cell">Amount Collected</th>
                  <th className="table-header-cell">Expected Amount</th>
                  <th className="table-header-cell">Total Amount Received</th>
                  <th className="table-header-cell">Collection %</th>
                </tr>
              </thead>
              <tbody className="table-body">
                {issuerPerformance.map((issuer) => (
                  <tr key={issuer.id} className="table-row">
                    <td className="table-cell font-medium">{issuer?.issuer_name || 'N/A'}</td>
                    <td className="table-cell">{issuer?.contact_number || 'N/A'}</td>
                    <td className="table-cell">{issuer?.diaries_allotted || 0}</td>
                    <td className="table-cell">{issuer?.diaries_paid || 0}</td>
                    <td className="table-cell">{issuer?.tickets_sold || 0}</td>
                    <td className="table-cell">₹{issuer?.total_collected?.toLocaleString() || '0'}</td>
                    <td className="table-cell">₹{issuer?.expected_amount?.toLocaleString() || '0'}</td>
                    <td className="table-cell">₹{((issuer?.diaries_paid || 0) * 11000).toLocaleString()}</td>
                    <td className="table-cell">
                      <span className={`
                        badge
                        ${(issuer?.collection_percentage || 0) >= 80 ? 'badge-success' : 
                          (issuer?.collection_percentage || 0) >= 50 ? 'badge-warning' : 'badge-danger'}
                      `}>
                        {issuer?.collection_percentage || 0}%
                      </span>
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

export default Dashboard;
