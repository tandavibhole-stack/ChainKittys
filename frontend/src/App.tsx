import { useState, useEffect } from 'react';
import {
  Wallet,
  PlusCircle,
  RotateCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Coins,
  Users,
  ArrowRight,
  History,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';
import {
  connectWallet,
  createGroup,
  contributeToGroup,
  triggerGroupPayout,
  flagDefault,
  getGroupStatus,
  getCycleInfo,
  getMemberHistory,
  CONTRACT_ID,
  NATIVE_TOKEN_ID,
} from './stellar';
import type {
  WalletInfo,
  CycleStatusResponse,
  MemberRecordResponse,
} from './stellar';
import { trackEvent, captureError } from './monitoring';

interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface MemberStat extends MemberRecordResponse {
  address: string;
}

function App() {
  // Wallet State
  const [wallet, setWallet] = useState<WalletInfo>({
    connected: false,
    address: null,
    network: null,
  });
  const [connecting, setConnecting] = useState(false);

  // Active Group Query
  const [activeGroupId, setActiveGroupId] = useState<number>(1);
  const [groupIdInput, setGroupIdInput] = useState<string>('1');

  // Active Group Details
  const [groupStatus, setGroupStatus] = useState<number | null>(null);
  const [cycleInfo, setCycleInfo] = useState<CycleStatusResponse | null>(null);
  const [memberStats, setMemberStats] = useState<MemberStat[]>([]);
  const [loadingGroup, setLoadingGroup] = useState(false);

  // Create Group Form
  const [formMembers, setFormMembers] = useState<string>('');
  const [formAmount, setFormAmount] = useState<string>('100');
  const [formDuration, setFormDuration] = useState<string>('120'); // Default: 2 minutes for testing
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Transaction Pending States
  const [txPending, setTxPending] = useState<string | null>(null);

  // Time remaining count
  const [timeLeft, setTimeLeft] = useState<string>('');

  // Toast
  const [toast, setToast] = useState<ToastState>({
    show: false,
    message: '',
    type: 'info',
  });

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ show: true, message, type });
  };

  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => {
        setToast((t) => ({ ...t, show: false }));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toast.show]);

  // Handle wallet connection
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const info = await connectWallet();
      setWallet(info);
      showToast('Wallet connected successfully!', 'success');
      trackEvent('wallet_connected', { address: info.address });
    } catch (err: any) {
      captureError(err, 'wallet_connection');
      showToast(err.message || 'Failed to connect wallet.', 'error');
    } finally {
      setConnecting(false);
    }
  };

  // Load Active Group Details
  const loadGroupDetails = async (id: number) => {
    setLoadingGroup(true);
    try {
      const status = await getGroupStatus(id);
      const cycle = await getCycleInfo(id);
      setGroupStatus(status);
      setCycleInfo(cycle);

      // Reconstruct member statistics
      const allMembers = [...cycle.paid_members, ...cycle.unpaid_members];
      const statsList: MemberStat[] = [];
      for (const member of allMembers) {
        const history = await getMemberHistory(id, member);
        statsList.push({
          address: member,
          ...history,
        });
      }
      setMemberStats(statsList);
      trackEvent('group_loaded', { groupId: id });
    } catch (err: any) {
      console.warn('Failed to load group details:', err);
      setGroupStatus(null);
      setCycleInfo(null);
      setMemberStats([]);
    } finally {
      setLoadingGroup(false);
    }
  };

  useEffect(() => {
    loadGroupDetails(activeGroupId);
  }, [activeGroupId]);

  // Countdown timer for cycle deadline
  useEffect(() => {
    if (!cycleInfo || cycleInfo.deadline === 0) {
      setTimeLeft('No deadline');
      return;
    }

    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const diff = cycleInfo.deadline - now;

      if (diff <= 0) {
        setTimeLeft('Deadline passed');
        clearInterval(interval);
      } else {
        const hours = Math.floor(diff / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        const seconds = diff % 60;
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [cycleInfo]);

  // Handle Group Creation
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.connected || !wallet.address) {
      showToast('Please connect your Freighter wallet first.', 'error');
      return;
    }

    setCreatingGroup(true);
    setTxPending('Creating Savings Group...');
    try {
      const membersList = formMembers
        .split(',')
        .map((addr) => addr.trim())
        .filter((addr) => addr.length > 0);

      if (membersList.length === 0) {
        throw new Error('Please enter at least one member address.');
      }

      // Automatically include organizer if not already in the list
      if (!membersList.includes(wallet.address)) {
        membersList.unshift(wallet.address);
      }

      const amount = Number(formAmount);
      const duration = Number(formDuration);

      if (isNaN(amount) || amount <= 0) {
        throw new Error('Contribution amount must be greater than zero.');
      }

      const txHash = await createGroup(wallet.address, membersList, amount, duration);
      showToast(`Group created successfully! Tx: ${txHash.substring(0, 8)}...`, 'success');
      trackEvent('group_created', { organizer: wallet.address, memberCount: membersList.length });
      
      setFormMembers('');
      setActiveGroupId((prev) => prev + 1);
    } catch (err: any) {
      captureError(err, 'create_group');
      showToast(err.message || 'Failed to create group.', 'error');
    } finally {
      setCreatingGroup(false);
      setTxPending(null);
    }
  };

  // Handle Contribution
  const handleContribute = async () => {
    if (!wallet.connected || !wallet.address) {
      showToast('Please connect your Freighter wallet.', 'error');
      return;
    }

    setTxPending('Submitting Contribution...');
    try {
      const txHash = await contributeToGroup(activeGroupId, wallet.address);
      showToast(`Contribution submitted! Hash: ${txHash.substring(0, 8)}...`, 'success');
      trackEvent('contribution_submitted', { groupId: activeGroupId, member: wallet.address });
      loadGroupDetails(activeGroupId);
    } catch (err: any) {
      captureError(err, 'contribute');
      showToast(err.message || 'Contribution failed.', 'error');
    } finally {
      setTxPending(null);
    }
  };

  // Handle Trigger Payout
  const handleTriggerPayout = async () => {
    if (!wallet.connected || !wallet.address) {
      showToast('Please connect your Freighter wallet.', 'error');
      return;
    }

    setTxPending('Releasing Payout...');
    try {
      const txHash = await triggerGroupPayout(activeGroupId, wallet.address);
      showToast(`Payout released and advanced cycle! Hash: ${txHash.substring(0, 8)}...`, 'success');
      trackEvent('payout_triggered', { groupId: activeGroupId });
      loadGroupDetails(activeGroupId);
    } catch (err: any) {
      captureError(err, 'trigger_payout');
      showToast(err.message || 'Payout trigger failed.', 'error');
    } finally {
      setTxPending(null);
    }
  };

  // Handle Flag Default
  const handleFlagDefault = async (defaultMember: string) => {
    if (!wallet.connected || !wallet.address) {
      showToast('Please connect your Freighter wallet.', 'error');
      return;
    }

    setTxPending('Flagging Member Default...');
    try {
      const txHash = await flagDefault(activeGroupId, defaultMember, wallet.address);
      showToast(`Member flagged as defaulted! Hash: ${txHash.substring(0, 8)}...`, 'success');
      trackEvent('default_flagged', { groupId: activeGroupId, member: defaultMember });
      loadGroupDetails(activeGroupId);
    } catch (err: any) {
      captureError(err, 'flag_default');
      showToast(err.message || 'Flag default failed.', 'error');
    } finally {
      setTxPending(null);
    }
  };

  // Map group status enum to label
  const getStatusBadge = (status: number | null) => {
    if (status === null) return { label: 'Not Found', class: 'bg-gray-800 text-gray-400 border-gray-700' };
    switch (status) {
      case 0: return { label: 'Forming', class: 'bg-blue-950 text-blue-300 border-blue-800 animate-pulse-slow' };
      case 1: return { label: 'Active', class: 'bg-emerald-950 text-emerald-300 border-emerald-800' };
      case 2: return { label: 'Completed', class: 'bg-purple-950 text-purple-300 border-purple-800' };
      case 3: return { label: 'Defaulted', class: 'bg-rose-950 text-rose-300 border-rose-800' };
      default: return { label: 'Unknown', class: 'bg-gray-800 text-gray-400 border-gray-700' };
    }
  };

  const statusBadge = getStatusBadge(groupStatus);

  return (
    <div className="min-h-screen bg-[#0d0f14] text-gray-100 flex flex-col justify-between">
      {/* Toast Notification */}
      {toast.show && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-lg border flex items-center gap-3 shadow-xl transition-all duration-300 ${
          toast.type === 'success' ? 'bg-emerald-950 text-emerald-300 border-emerald-800' :
          toast.type === 'error' ? 'bg-rose-950 text-rose-300 border-rose-800' :
          'bg-blue-950 text-blue-300 border-blue-800'
        }`}>
          {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          {toast.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-400" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Transaction Loading Overlay */}
      {txPending && (
        <div className="fixed inset-0 bg-black/75 z-40 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-lg font-semibold text-gradient animate-pulse">{txPending}</p>
          <p className="text-xs text-gray-400">Please confirm and sign the transaction in your Freighter wallet extension.</p>
        </div>
      )}

      {/* Navigation Header */}
      <header className="border-b border-gray-800 bg-[#0d0f14]/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-pink-500 to-purple-600 p-2 rounded-xl shadow-lg shadow-pink-500/10">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                Chain<span className="text-pink-500">Kitty</span>
              </h1>
              <p className="text-[10px] text-gray-400 font-mono">Soroban Savings Circles</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {wallet.connected ? (
              <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 px-4 py-2 rounded-xl">
                <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-mono text-gray-300">
                  {wallet.address?.substring(0, 6)}...{wallet.address?.substring(wallet.address.length - 4)}
                </span>
                <span className="bg-pink-950 text-pink-300 text-[10px] px-2 py-0.5 rounded-full border border-pink-800 font-semibold uppercase">
                  {wallet.network}
                </span>
              </div>
            ) : (
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="glow-btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Wallet className="w-4 h-4" />
                {connecting ? 'Connecting...' : 'Connect Wallet'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-grow grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
        {/* Left Column: Actions / Group Creation */}
        <div className="lg:col-span-4 flex flex-col gap-8">
          {/* Create Group Form */}
          <div className="glass-panel rounded-2xl p-6 shadow-xl border border-white/5">
            <div className="flex items-center gap-2 mb-6">
              <PlusCircle className="w-5 h-5 text-pink-500" />
              <h2 className="text-lg font-bold">New Savings Circle</h2>
            </div>

            <form onSubmit={handleCreateGroup} className="flex flex-col gap-5">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Member Addresses (Comma separated)
                </label>
                <textarea
                  value={formMembers}
                  onChange={(e) => setFormMembers(e.target.value)}
                  placeholder="GAAZ..., GBCD..., GDEF..."
                  rows={4}
                  className="w-full bg-[#161a24] border border-gray-800 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-pink-500 transition-colors resize-none font-mono"
                  required
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  Organizer is auto-included. Addresses must be valid Stellar public keys.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Cycle Contribution Amount (XLM)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full bg-[#161a24] border border-gray-800 rounded-xl pl-4 pr-12 py-3 text-sm text-gray-200 focus:outline-none focus:border-pink-500 transition-colors"
                    required
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">XLM</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Cycle Duration
                </label>
                <select
                  value={formDuration}
                  onChange={(e) => setFormDuration(e.target.value)}
                  className="w-full bg-[#161a24] border border-gray-800 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-pink-500 transition-colors"
                >
                  <option value="120">2 Minutes (Testing)</option>
                  <option value="3600">1 Hour</option>
                  <option value="86400">1 Day</option>
                  <option value="604800">1 Week</option>
                  <option value="2592000">1 Month</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={creatingGroup || !wallet.connected}
                className="w-full bg-gradient-to-tr from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white py-3 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-2 cursor-pointer shadow-lg shadow-pink-500/10"
              >
                {creatingGroup ? 'Creating...' : 'Launch Savings Circle'}
                <ArrowRight className="w-4 h-4" />
              </button>
              {!wallet.connected && (
                <p className="text-[10px] text-rose-400 text-center">Connect Freighter wallet to create groups.</p>
              )}
            </form>
          </div>

          {/* Setup / Contract Info */}
          <div className="glass-card rounded-2xl p-6 border border-white/5 flex flex-col gap-4 text-xs">
            <div className="flex items-center gap-2 text-pink-400 font-bold mb-1">
              <History className="w-4 h-4" />
              <span>Contract Configuration</span>
            </div>
            <div>
              <span className="block text-[10px] text-gray-500 uppercase font-semibold">Contract ID</span>
              <span className="font-mono text-gray-300 break-all select-all">{CONTRACT_ID}</span>
            </div>
            <div>
              <span className="block text-[10px] text-gray-500 uppercase font-semibold">Native Token ID (XLM SAC)</span>
              <span className="font-mono text-gray-300 break-all">{NATIVE_TOKEN_ID}</span>
            </div>
          </div>
        </div>

        {/* Right Column: Group Status & Operations */}
        <div className="lg:col-span-8 flex flex-col gap-8">
          {/* Query Active Group Panel */}
          <div className="glass-panel rounded-2xl p-6 shadow-xl border border-white/5 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-purple-400" />
              <div>
                <h3 className="font-bold">Active Savings Circle Dashboard</h3>
                <p className="text-xs text-gray-400">Query and participate in active rotations</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                value={groupIdInput}
                onChange={(e) => setGroupIdInput(e.target.value)}
                className="w-20 bg-[#161a24] border border-gray-800 rounded-xl px-3 py-2 text-sm text-gray-200 text-center focus:outline-none focus:border-pink-500"
                min="1"
              />
              <button
                onClick={() => {
                  const id = Number(groupIdInput);
                  if (!isNaN(id) && id > 0) {
                    setActiveGroupId(id);
                  }
                }}
                className="bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs px-4 py-2.5 rounded-xl border border-gray-700 font-semibold cursor-pointer transition-colors"
              >
                Query
              </button>
            </div>
          </div>

          {loadingGroup ? (
            <div className="flex-grow flex flex-col items-center justify-center min-h-[300px] gap-3">
              <div className="w-8 h-8 border-3 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm text-gray-400">Querying Soroban contract state...</p>
            </div>
          ) : groupStatus === null ? (
            /* Empty State */
            <div className="glass-panel rounded-2xl p-10 flex flex-col items-center justify-center text-center min-h-[300px] border border-white/5">
              <AlertTriangle className="w-12 h-12 text-gray-600 mb-4 animate-pulse" />
              <h3 className="text-lg font-bold mb-1">Savings Circle #{activeGroupId} Not Found</h3>
              <p className="text-sm text-gray-500 max-w-sm">
                This circle has not been initialized yet on Stellar Testnet. Create a new circle or try searching for another ID.
              </p>
            </div>
          ) : (
            /* Active Group Dashboard */
            <div className="flex flex-col gap-8">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Status Card */}
                <div className="glass-panel rounded-2xl p-5 border border-white/5 flex items-center justify-between">
                  <div>
                    <span className="block text-[10px] text-gray-500 uppercase font-semibold mb-1">Circle Status</span>
                    <span className="text-xl font-bold tracking-tight">Circle #{activeGroupId}</span>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusBadge.class}`}>
                    {statusBadge.label}
                  </span>
                </div>

                {/* Pool Escrow Card */}
                <div className="glass-panel rounded-2xl p-5 border border-white/5 flex items-center justify-between">
                  <div>
                    <span className="block text-[10px] text-gray-500 uppercase font-semibold mb-1">Escrow Balance</span>
                    <span className="text-xl font-extrabold text-pink-400">
                      {cycleInfo ? cycleInfo.paid_members.length * 100 : 0} <span className="text-xs text-gray-400">XLM</span>
                    </span>
                  </div>
                  <div className="bg-pink-950/40 p-2.5 rounded-xl border border-pink-900/30">
                    <Coins className="w-5 h-5 text-pink-400" />
                  </div>
                </div>

                {/* Deadline Card */}
                <div className="glass-panel rounded-2xl p-5 border border-white/5 flex items-center justify-between">
                  <div>
                    <span className="block text-[10px] text-gray-500 uppercase font-semibold mb-1">Time Remaining</span>
                    <span className={`text-sm font-bold ${timeLeft === 'Deadline passed' ? 'text-rose-400' : 'text-purple-400'}`}>
                      {timeLeft}
                    </span>
                  </div>
                  <div className="bg-purple-950/40 p-2.5 rounded-xl border border-purple-900/30">
                    <Clock className="w-5 h-5 text-purple-400" />
                  </div>
                </div>
              </div>

              {/* Cycle Rotation Panel */}
              <div className="glass-panel rounded-2xl p-6 border border-white/5">
                <h4 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4">
                  Cycle #{cycleInfo?.current_cycle} Rotation Info
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#161a24]/50 rounded-xl p-5 border border-gray-800/40">
                  <div>
                    <span className="block text-xs text-gray-500 mb-1">Current Designated Recipient</span>
                    <span className="font-mono text-sm text-pink-400 break-all select-all font-semibold">
                      {cycleInfo?.next_recipient}
                    </span>
                    {wallet.address === cycleInfo?.next_recipient && (
                      <span className="inline-block mt-2 bg-pink-950 text-pink-300 text-[9px] px-2 py-0.5 rounded border border-pink-800 font-bold uppercase">
                        It's your turn! ðŸ±
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="block text-xs text-gray-500 mb-1">Contribution Pool Goal</span>
                    <span className="text-lg font-bold">
                      {cycleInfo?.paid_members.length} / {memberStats.length} Paid
                    </span>
                    <div className="w-full bg-gray-800 h-2 rounded-full mt-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-pink-500 to-purple-600 h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${memberStats.length ? (cycleInfo?.paid_members.length || 0) * 100 / memberStats.length : 0}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 mt-6 flex-wrap">
                  {/* Contribute Button */}
                  <button
                    onClick={handleContribute}
                    disabled={
                      groupStatus !== 1 ||
                      !!(cycleInfo && cycleInfo.paid_members.includes(wallet.address || ''))
                    }
                    className="flex-grow bg-gradient-to-tr from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-pink-500/10"
                  >
                    <Coins className="w-4 h-4" />
                    {cycleInfo && cycleInfo.paid_members.includes(wallet.address || '')
                      ? 'Already Contributed'
                      : 'Contribute for this Cycle'}
                  </button>

                  {/* Trigger Payout Button */}
                  <button
                    onClick={handleTriggerPayout}
                    disabled={groupStatus !== 1}
                    className="flex-grow bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold py-3 px-6 rounded-xl text-sm border border-gray-700 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <RotateCw className="w-4 h-4" />
                    Trigger Payout & Advance
                  </button>
                </div>
              </div>

              {/* Members Contributions Status Table */}
              <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
                <div className="px-6 py-5 border-b border-gray-800/80 flex items-center justify-between">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-gray-400">
                    Cycle Member Payments
                  </h4>
                  <span className="text-xs text-gray-400 font-semibold">
                    {cycleInfo?.unpaid_members.length} unpaid
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-gray-800/60 bg-gray-900/30 text-xs font-semibold text-gray-500">
                        <th className="px-6 py-3.5">Address</th>
                        <th className="px-6 py-3.5">Status</th>
                        <th className="px-6 py-3.5">Total Paid</th>
                        <th className="px-6 py-3.5">Payouts Recv</th>
                        <th className="px-6 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/40">
                      {memberStats.map((stat) => {
                        const paid = cycleInfo?.paid_members.includes(stat.address);
                        const isUser = wallet.address === stat.address;

                        return (
                          <tr key={stat.address} className={`hover:bg-gray-900/20 ${isUser ? 'bg-pink-950/10' : ''}`}>
                            <td className="px-6 py-4 font-mono text-xs text-gray-300 max-w-[200px] truncate">
                              <span className="break-all select-all">{stat.address}</span>
                              {isUser && <span className="text-[10px] text-pink-400 ml-1.5">(You)</span>}
                            </td>
                            <td className="px-6 py-4">
                              {paid ? (
                                <span className="inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-900/50 font-medium">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Paid
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-rose-400 bg-rose-950/30 px-2 py-0.5 rounded border border-rose-900/50 font-medium">
                                  <Clock className="w-3.5 h-3.5" />
                                  Unpaid
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 font-semibold text-gray-200">
                              {stat.contributions_made} XLM
                            </td>
                            <td className="px-6 py-4 font-semibold text-pink-400">
                              {stat.payouts_received} XLM
                            </td>
                            <td className="px-6 py-4 text-right">
                              {!paid && timeLeft === 'Deadline passed' && (
                                <button
                                  onClick={() => handleFlagDefault(stat.address)}
                                  className="text-xs bg-rose-950/80 hover:bg-rose-900 text-rose-300 px-3 py-1.5 rounded-lg border border-rose-800 font-semibold cursor-pointer transition-colors inline-flex items-center gap-1"
                                >
                                  <ShieldAlert className="w-3 h-3" />
                                  Flag Default
                                </button>
                              )}
                              {stat.defaults > 0 && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-rose-400 font-bold bg-rose-950/20 px-2 py-1 rounded border border-rose-900/40 uppercase">
                                  {stat.defaults} Default{stat.defaults > 1 ? 's' : ''} (10% Penalty)
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 bg-[#0d0f14] py-8 mt-12 text-center text-xs text-gray-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <p>Â© 2026 ChainKitty. All smart contract actions require Freighter wallet approval.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-gray-300">Terms</a>
            <a href="#" className="hover:text-gray-300">Privacy</a>
            <a href="#" className="hover:text-gray-300">Docs</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
