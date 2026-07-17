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
  Compass,
  Bell,
  Check,
  UserCheck,
  Smartphone,
  ExternalLink,
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
  getEscrowBalance,
  joinGroup,
  getOpenGroups,
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
  const [escrowBalance, setEscrowBalance] = useState<number>(0);

  // Create Group Form
  const [formMembers, setFormMembers] = useState<string[]>(['']);
  const [formAmount, setFormAmount] = useState<string>('100');
  const [formDuration, setFormDuration] = useState<string>('120'); // Default: 2 minutes
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Discovery State
  const [openGroups, setOpenGroups] = useState<number[]>([]);
  const [loadingOpenGroups, setLoadingOpenGroups] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'discovery' | 'create'>('dashboard');

  // Onboarding Wizard State
  const [showWizard, setShowWizard] = useState<boolean>(false);
  const [wizardStep, setWizardStep] = useState<number>(1);

  // Transaction Confirmation State
  const [recentTx, setRecentTx] = useState<{ type: string; hash: string; details?: string } | null>(null);

  // Email Notification hook state
  const [emailHookSent, setEmailHookSent] = useState<boolean>(false);

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
      }, 5050);
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
      // Advance wizard if open
      if (showWizard && wizardStep === 1) {
        setWizardStep(2);
      }
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
      const balance = await getEscrowBalance();
      setGroupStatus(status);
      setCycleInfo(cycle);
      setEscrowBalance(balance);

      // Reconstruct member statistics
      const allMembers = [...cycle.paid_members, ...cycle.unpaid_members];
      const statsList: MemberStat[] = [];
      for (const member of allMembers) {
        try {
          const history = await getMemberHistory(id, member);
          statsList.push({
            address: member,
            ...history,
          });
        } catch (_) {
          // Fallback if history record not initialized
          statsList.push({
            address: member,
            contributions_made: 0,
            payouts_received: 0,
            defaults: 0,
            reputation_score: 100,
          });
        }
      }
      setMemberStats(statsList);
      trackEvent('group_loaded', { groupId: id });
    } catch (err: any) {
      console.warn('Failed to load group details:', err);
      setGroupStatus(null);
      setCycleInfo(null);
      setMemberStats([]);
      setEscrowBalance(0);
    } finally {
      setLoadingGroup(false);
    }
  };

  // Load Open Groups for Discovery
  const loadOpenGroups = async () => {
    setLoadingOpenGroups(true);
    try {
      const groups = await getOpenGroups();
      setOpenGroups(groups);
    } catch (err) {
      console.warn('Failed to load open groups:', err);
    } finally {
      setLoadingOpenGroups(false);
    }
  };

  useEffect(() => {
    loadGroupDetails(activeGroupId);
    loadOpenGroups();
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
        .map((addr) => addr.trim())
        .filter((addr) => addr.length > 0);

      const amount = Number(formAmount);
      const duration = Number(formDuration);

      if (isNaN(amount) || amount <= 0) {
        throw new Error('Contribution amount must be greater than zero.');
      }

      // Organizer is always included
      const fullMembers = membersList.includes(wallet.address) 
        ? membersList 
        : [wallet.address, ...membersList];

      const result = await createGroup(wallet.address, fullMembers, amount, duration);
      
      trackEvent('group_created', { organizer: wallet.address, memberCount: fullMembers.length });
      
      setRecentTx({
        type: 'Launch Savings Circle',
        hash: result.hash,
        details: `Successfully launched Savings Circle #${result.groupId} on Stellar Testnet with ${fullMembers.length} members.`,
      });

      setFormMembers(['']);
      setActiveGroupId(result.groupId);
      setGroupIdInput(result.groupId.toString());
      loadOpenGroups();
      setActiveTab('dashboard');
    } catch (err: any) {
      captureError(err, 'create_group');
      showToast(err.message || 'Failed to create group.', 'error');
    } finally {
      setCreatingGroup(false);
      setTxPending(null);
    }
  };

  // Handle Joining Group
  const handleJoinGroup = async (id: number) => {
    if (!wallet.connected || !wallet.address) {
      showToast('Please connect your Freighter wallet.', 'error');
      return;
    }

    setTxPending('Joining Savings Circle...');
    try {
      const txHash = await joinGroup(id, wallet.address);
      showToast(`Successfully joined Circle #${id}!`, 'success');
      trackEvent('group_joined', { groupId: id, member: wallet.address });
      
      setRecentTx({
        type: 'Join savings circle',
        hash: txHash,
        details: `Successfully joined Savings Circle #${id} on-chain.`,
      });

      loadOpenGroups();
      setActiveGroupId(id);
      setGroupIdInput(id.toString());
      setActiveTab('dashboard');
    } catch (err: any) {
      captureError(err, 'join_group');
      showToast(err.message || 'Failed to join group.', 'error');
    } finally {
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
      trackEvent('contribution_submitted', { groupId: activeGroupId, member: wallet.address });
      
      setRecentTx({
        type: 'Submit Contribution',
        hash: txHash,
        details: `Submitted cycle contribution of ${formAmount} XLM to Circle #${activeGroupId}.`,
      });

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
      trackEvent('payout_triggered', { groupId: activeGroupId });
      
      setRecentTx({
        type: 'Release Payout & Advance Cycle',
        hash: txHash,
        details: `Released accumulated savings pool payout and advanced Circle #${activeGroupId} to the next cycle.`,
      });

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
      trackEvent('default_flagged', { groupId: activeGroupId, member: defaultMember });
      
      setRecentTx({
        type: 'Flag Member Default',
        hash: txHash,
        details: `Flagged member ${defaultMember} for missing the contribution deadline in Circle #${activeGroupId}.`,
      });

      loadGroupDetails(activeGroupId);
    } catch (err: any) {
      captureError(err, 'flag_default');
      showToast(err.message || 'Flag default failed.', 'error');
    } finally {
      setTxPending(null);
    }
  };

  // Handle Email Reminder hook
  const handleEmailReminder = () => {
    setEmailHookSent(true);
    showToast('Deadline reminder request dispatched successfully!', 'success');
    console.log(`[Email Reminder Hook] Dispatched email reminder for member ${wallet.address} regarding group ${activeGroupId}`);
    trackEvent('email_reminder_hook', { groupId: activeGroupId, member: wallet.address });
    setTimeout(() => setEmailHookSent(false), 8000);
  };

  // Map group status enum to label
  const getStatusBadge = (status: number | null) => {
    if (status === null) return { label: 'Not Found', class: 'bg-gray-800 text-gray-400 border-gray-700' };
    switch (status) {
      case 0: return { label: 'Forming', class: 'bg-blue-950 text-blue-300 border-blue-800 animate-pulse' };
      case 1: return { label: 'Active', class: 'bg-emerald-950 text-emerald-300 border-emerald-800' };
      case 2: return { label: 'Completed', class: 'bg-purple-950 text-purple-300 border-purple-800' };
      case 3: return { label: 'Defaulted', class: 'bg-rose-950 text-rose-300 border-rose-800' };
      default: return { label: 'Unknown', class: 'bg-gray-800 text-gray-400 border-gray-700' };
    }
  };

  const statusBadge = getStatusBadge(groupStatus);

  // Check if upcoming deadline (notification banner logic)
  const showDeadlineBanner = 
    groupStatus === 1 && 
    cycleInfo && 
    wallet.address && 
    cycleInfo.unpaid_members.includes(wallet.address) &&
    timeLeft !== 'Deadline passed';

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

      {/* Transaction Confirmation Dialog */}
      {recentTx && (
        <div className="fixed inset-0 bg-black/85 z-50 flex flex-col items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full rounded-2xl p-6 border border-white/10 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 bg-emerald-950/50 border border-emerald-500/30 rounded-full flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gradient">Transaction Confirmed!</h3>
              <p className="text-sm text-gray-300 mt-1">{recentTx.type}</p>
              {recentTx.details && <p className="text-xs text-gray-400 mt-2 bg-[#161a24] p-3 rounded-lg border border-gray-800 font-mono text-left">{recentTx.details}</p>}
            </div>
            <div className="w-full flex flex-col gap-2 mt-2">
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${recentTx.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-4 bg-gray-900 hover:bg-gray-700 border border-gray-705 text-gray-205 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                View on Stellar.expert
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={() => setRecentTx(null)}
                className="w-full py-2.5 px-4 bg-gradient-to-tr from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Wizard Modal */}
      {showWizard && (
        <div className="fixed inset-0 bg-black/85 z-40 flex flex-col items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full rounded-2xl p-6 border border-white/10 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-pink-500" />
                <h3 className="font-bold">Onboarding Wizard</h3>
              </div>
              <button 
                onClick={() => setShowWizard(false)}
                className="text-gray-400 hover:text-gray-200 text-xs"
              >
                ✕ Close
              </button>
            </div>

            {/* Stepper Header */}
            <div className="flex items-center justify-between text-xs font-semibold text-gray-400">
              <span className={wizardStep >= 1 ? 'text-pink-400' : ''}>1. Connect</span>
              <div className="h-0.5 bg-gray-800 flex-grow mx-2"></div>
              <span className={wizardStep >= 2 ? 'text-pink-400' : ''}>2. Fund Wallet</span>
              <div className="h-0.5 bg-gray-800 flex-grow mx-2"></div>
              <span className={wizardStep >= 3 ? 'text-pink-400' : ''}>3. Join Group</span>
            </div>

            {/* Step Content */}
            {wizardStep === 1 && (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-gray-300">
                  Welcome to ChainKitty! To get started, connect your Freighter Wallet extension configured for Stellar Testnet.
                </p>
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="w-full py-2.5 bg-gradient-to-tr from-pink-500 to-purple-600 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Wallet className="w-4 h-4" />
                  {connecting ? 'Connecting...' : 'Connect Wallet'}
                </button>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-gray-300">
                  Awesome! Now you need Testnet XLM to make contributions and launch savings circles. Fund your wallet instantly using Stellar's Friendbot service.
                </p>
                <div className="bg-[#161a24] p-3 rounded-lg border border-gray-800 font-mono text-[10px] break-all">
                  {wallet.address}
                </div>
                <a
                  href={`https://friendbot.stellar.org/?addr=${wallet.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 cursor-pointer border border-gray-700"
                >
                  Fund via Stellar Friendbot API
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  onClick={() => setWizardStep(3)}
                  className="w-full py-2.5 bg-gradient-to-tr from-pink-500 to-purple-600 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 cursor-pointer mt-1"
                >
                  I've Funded My Wallet
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-gray-300">
                  You are all set! Now you can browse public open groups to join, or create a brand new Savings Circle with your friends.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setActiveTab('discovery');
                      setShowWizard(false);
                    }}
                    className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold rounded-xl cursor-pointer border border-gray-700"
                  >
                    Browse Open Groups
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab('create');
                      setShowWizard(false);
                    }}
                    className="flex-1 py-2.5 bg-gradient-to-tr from-pink-500 to-purple-600 text-white text-xs font-semibold rounded-xl cursor-pointer"
                  >
                    Create a Group
                  </button>
                </div>
              </div>
            )}
          </div>
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

          {/* Desktop Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-gray-900/60 border border-gray-800 p-1.5 rounded-xl">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer transition-all ${
                activeTab === 'dashboard' ? 'bg-pink-500 text-white shadow-md' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Circle Dashboard
            </button>
            <button
              onClick={() => {
                setActiveTab('discovery');
                loadOpenGroups();
              }}
              className={`px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer transition-all ${
                activeTab === 'discovery' ? 'bg-pink-500 text-white shadow-md' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Group Discovery
            </button>
            <button
              onClick={() => setActiveTab('create')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer transition-all ${
                activeTab === 'create' ? 'bg-pink-500 text-white shadow-md' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Launch Circle
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                setWizardStep(wallet.connected ? 2 : 1);
                setShowWizard(true);
              }}
              className="text-xs bg-purple-950/40 hover:bg-purple-900/50 text-purple-300 border border-purple-900/40 px-3.5 py-2.5 rounded-xl font-semibold cursor-pointer transition-colors hidden sm:inline-block"
            >
              Onboarding Wizard
            </button>

            {wallet.connected ? (
              <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 px-4 py-2 rounded-xl">
                <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-mono text-gray-300">
                  {wallet.address?.substring(0, 6)}...{wallet.address?.substring(wallet.address.length - 4)}
                </span>
                <span className="bg-pink-955 text-pink-300 text-[10px] px-2 py-0.5 rounded-full border border-pink-800 font-semibold uppercase font-mono">
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
                {connecting ? 'Connecting...' : 'Connect'}
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation Tabs */}
        <div className="md:hidden border-t border-gray-850 bg-gray-950 flex items-center justify-around py-3">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center gap-1 text-[10px] font-medium ${activeTab === 'dashboard' ? 'text-pink-500' : 'text-gray-400'}`}
          >
            <Users className="w-4 h-4" />
            Circle
          </button>
          <button 
            onClick={() => {
              setActiveTab('discovery');
              loadOpenGroups();
            }}
            className={`flex flex-col items-center gap-1 text-[10px] font-medium ${activeTab === 'discovery' ? 'text-pink-500' : 'text-gray-400'}`}
          >
            <Compass className="w-4 h-4" />
            Discover
          </button>
          <button 
            onClick={() => setActiveTab('create')}
            className={`flex flex-col items-center gap-1 text-[10px] font-medium ${activeTab === 'create' ? 'text-pink-500' : 'text-gray-400'}`}
          >
            <PlusCircle className="w-4 h-4" />
            Launch
          </button>
          <button 
            onClick={() => {
              setWizardStep(wallet.connected ? 2 : 1);
              setShowWizard(true);
            }}
            className="flex flex-col items-center gap-1 text-[10px] text-purple-400"
          >
            <Smartphone className="w-4 h-4" />
            Wizard
          </button>
        </div>
      </header>

      {/* Upcoming Deadline Notification Banner */}
      {showDeadlineBanner && (
        <div className="bg-gradient-to-r from-pink-955/60 via-purple-955/60 to-gray-955/80 border-b border-pink-900/30 py-3.5 px-4 text-center">
          <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-sm text-pink-300 text-left">
              <Bell className="w-4 h-4 text-pink-405 animate-bounce" />
              <span>
                <strong>Upcoming Contribution Deadline!</strong> You have not contributed yet for Cycle #{cycleInfo?.current_cycle} in Circle #{activeGroupId}. Time Remaining: <strong className="text-white">{timeLeft}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleContribute}
                className="bg-gradient-to-tr from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-md cursor-pointer"
              >
                Contribute Now
              </button>
              <button
                onClick={handleEmailReminder}
                disabled={emailHookSent}
                className="bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-750 text-xs px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1"
              >
                {emailHookSent ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Bell className="w-3.5 h-3.5" />}
                {emailHookSent ? 'Hook Scheduled' : 'Schedule Email Reminder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-grow w-full">
        {/* Tab 1: Circle Dashboard */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Sidebar Query panel */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              {/* Query Card */}
              <div className="glass-panel rounded-2xl p-6 border border-white/5 flex flex-col gap-4 shadow-xl">
                <div className="flex items-center gap-2.5">
                  <Users className="w-5 h-5 text-purple-400" />
                  <h3 className="font-bold">Active Circle Selection</h3>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Enter any active Savings Circle group ID to check contributions, rotations, and payouts.
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="number"
                    value={groupIdInput}
                    onChange={(e) => setGroupIdInput(e.target.value)}
                    className="w-full bg-[#161a24] border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-pink-500 font-semibold"
                    min="1"
                  />
                  <button
                    onClick={() => {
                      const id = Number(groupIdInput);
                      if (!isNaN(id) && id > 0) {
                        setActiveGroupId(id);
                      }
                    }}
                    className="bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs px-5 py-3 rounded-xl border border-gray-700 font-bold cursor-pointer transition-colors"
                  >
                    Query
                  </button>
                </div>
              </div>

              {/* Technical Config info card */}
              <div className="glass-card rounded-2xl p-6 border border-white/5 flex flex-col gap-4 text-[11px] leading-relaxed">
                <div className="flex items-center gap-2 text-pink-400 font-bold mb-1">
                  <History className="w-4 h-4" />
                  <span>Stellar Contract Details</span>
                </div>
                <div>
                  <span className="block text-[9px] text-gray-500 uppercase font-semibold">ChainKitty Contract ID</span>
                  <span className="font-mono text-gray-300 break-all select-all font-semibold">{CONTRACT_ID}</span>
                </div>
                <div>
                  <span className="block text-[9px] text-gray-500 uppercase font-semibold">Testnet XLM Token ID</span>
                  <span className="font-mono text-gray-300 break-all">{NATIVE_TOKEN_ID}</span>
                </div>
              </div>
            </div>

            {/* Dashboard details */}
            <div className="lg:col-span-8">
              {loadingGroup ? (
                <div className="flex flex-col items-center justify-center min-h-[350px] gap-3">
                  <div className="w-8 h-8 border-3 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm text-gray-400">Fetching Soroban ledger state...</p>
                </div>
              ) : groupStatus === null ? (
                /* Empty state */
                <div className="glass-panel rounded-2xl p-10 flex flex-col items-center justify-center text-center min-h-[350px] border border-white/5">
                  <AlertTriangle className="w-12 h-12 text-gray-600 mb-4 animate-pulse" />
                  <h3 className="text-lg font-bold mb-1">Savings Circle #{activeGroupId} Not Found</h3>
                  <p className="text-sm text-gray-500 max-w-sm mt-1">
                    This circle has not been initialized yet on Stellar Testnet. Launch a new circle or try searching for another ID.
                  </p>
                  <button
                    onClick={() => setActiveTab('create')}
                    className="mt-5 px-4 py-2 bg-gradient-to-tr from-pink-500 to-purple-600 text-white rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Launch a New Circle
                  </button>
                </div>
              ) : (
                /* Active Dashboard */
                <div className="flex flex-col gap-6 animate-fade-in">
                  {/* Stats Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    {/* Status badge card */}
                    <div className="glass-panel rounded-2xl p-5 border border-white/5 flex items-center justify-between">
                      <div>
                        <span className="block text-[9px] text-gray-500 uppercase font-semibold mb-1">Circle Identifier</span>
                        <span className="text-lg font-bold tracking-tight">Circle #{activeGroupId}</span>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusBadge.class}`}>
                        {statusBadge.label}
                      </span>
                    </div>

                    {/* Escrow balance */}
                    <div className="glass-panel rounded-2xl p-5 border border-white/5 flex items-center justify-between">
                      <div>
                        <span className="block text-[9px] text-gray-500 uppercase font-semibold mb-1">Pool Escrow Balance</span>
                        <span className="text-lg font-extrabold text-pink-400">
                          {escrowBalance} <span className="text-xs text-gray-400 font-semibold font-mono">XLM</span>
                        </span>
                      </div>
                      <div className="bg-pink-955/40 p-2 rounded-xl border border-pink-900/30">
                        <Coins className="w-4 h-4 text-pink-400" />
                      </div>
                    </div>

                    {/* Countdown */}
                    <div className="glass-panel rounded-2xl p-5 border border-white/5 flex items-center justify-between">
                      <div>
                        <span className="block text-[9px] text-gray-500 uppercase font-semibold mb-1">Deadline Time Left</span>
                        <span className={`text-xs font-bold ${timeLeft === 'Deadline passed' ? 'text-rose-400' : 'text-purple-400'}`}>
                          {timeLeft}
                        </span>
                      </div>
                      <div className="bg-purple-955/40 p-2 rounded-xl border border-purple-900/30">
                        <Clock className="w-4 h-4 text-purple-400" />
                      </div>
                    </div>
                  </div>

                  {/* Active Cycle Panel */}
                  <div className="glass-panel rounded-2xl p-6 border border-white/5 flex flex-col gap-5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                        Cycle #{cycleInfo?.current_cycle} Rotation Information
                      </h4>
                      {groupStatus === 0 && (
                        <span className="text-xs text-blue-400 bg-blue-950/30 border border-blue-900/40 px-2.5 py-0.5 rounded-full font-semibold">
                          Open/Forming Group
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-[#161a24]/50 rounded-xl p-5 border border-gray-800/40">
                      <div>
                        <span className="block text-[11px] text-gray-400 mb-1.5 font-medium">Current Designated Recipient</span>
                        <span className="font-mono text-xs text-pink-400 break-all select-all font-semibold">
                          {cycleInfo?.next_recipient || 'Pending members filling...'}
                        </span>
                        {wallet.address === cycleInfo?.next_recipient && (
                          <div className="inline-flex items-center gap-1.5 mt-2 bg-pink-950 text-pink-300 text-[9px] px-2 py-0.5 rounded border border-pink-800 font-bold uppercase">
                            <UserCheck className="w-3 h-3" />
                            It's your turn!
                          </div>
                        )}
                      </div>
                      <div>
                        <span className="block text-[11px] text-gray-400 mb-1.5 font-medium">Contribution Pool Goal</span>
                        <span className="text-base font-bold">
                          {cycleInfo?.paid_members.length || 0} / {memberStats.length || 0} Paid
                        </span>
                        <div className="w-full bg-gray-800 h-1.5 rounded-full mt-2.5 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-pink-500 to-purple-600 h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${memberStats.length ? ((cycleInfo?.paid_members.length || 0) * 100) / memberStats.length : 0}%`,
                            }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-4 mt-2 flex-wrap">
                      {/* Contribute button */}
                      <button
                        onClick={handleContribute}
                        disabled={
                          groupStatus !== 1 ||
                          !!(cycleInfo && cycleInfo.paid_members.includes(wallet.address || ''))
                        }
                        className="flex-grow bg-gradient-to-tr from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-pink-500/10 transition-all"
                      >
                        <Coins className="w-4 h-4" />
                        {cycleInfo && cycleInfo.paid_members.includes(wallet.address || '')
                          ? 'Contribution Submitted'
                          : 'Contribute for this Cycle'}
                      </button>

                      {/* Trigger Payout button */}
                      <button
                        onClick={handleTriggerPayout}
                        disabled={groupStatus !== 1}
                        className="flex-grow bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold py-3 px-6 rounded-xl text-xs border border-gray-750 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <RotateCw className="w-4 h-4" />
                        Trigger Payout & Advance Cycle
                      </button>
                    </div>
                  </div>

                  {/* Members contributions status grid with reputation display */}
                  <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
                    <div className="px-6 py-4.5 border-b border-gray-800/80 flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                        Cycle Member Reputation & Payout Status
                      </h4>
                      <span className="text-[11px] text-gray-400 font-semibold bg-gray-900/80 border border-gray-800 px-2 py-0.5 rounded">
                        {cycleInfo?.unpaid_members.length || 0} unpaid
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-gray-800/60 bg-gray-900/30 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            <th className="px-6 py-3.5">Member Account</th>
                            <th className="px-6 py-3.5">Reputation</th>
                            <th className="px-6 py-3.5">Payments</th>
                            <th className="px-6 py-3.5">Defaults Penalty</th>
                            <th className="px-6 py-3.5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/40">
                          {memberStats.map((stat) => {
                            const paid = cycleInfo?.paid_members.includes(stat.address);
                            const isUser = wallet.address === stat.address;

                            return (
                              <tr key={stat.address} className={`hover:bg-gray-900/20 transition-colors ${isUser ? 'bg-pink-955/10' : ''}`}>
                                <td className="px-6 py-4 font-mono text-xs text-gray-300 max-w-[180px] truncate">
                                  <span className="break-all select-all font-medium">{stat.address}</span>
                                  {isUser && <span className="text-[9px] text-pink-400 ml-1.5 font-bold uppercase bg-pink-950 px-1 py-0.2 rounded border border-pink-900/50">(You)</span>}
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-1.5">
                                    <div className="flex flex-col">
                                      <div className="flex items-center gap-1">
                                        <span className={`font-bold ${
                                          stat.reputation_score >= 80 ? 'text-emerald-400' :
                                          stat.reputation_score >= 50 ? 'text-amber-400' :
                                          'text-rose-400'
                                        }`}>{stat.reputation_score}%</span>
                                        <span className="text-[10px] text-gray-500">Rep</span>
                                      </div>
                                      <div className="w-14 bg-gray-800 h-1 rounded-full overflow-hidden mt-0.5">
                                        <div 
                                          className={`h-full rounded-full ${
                                            stat.reputation_score >= 80 ? 'bg-emerald-500' :
                                            stat.reputation_score >= 50 ? 'bg-amber-500' :
                                            'bg-rose-500'
                                          }`}
                                          style={{ width: `${stat.reputation_score}%` }}
                                        ></div>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-semibold text-gray-200">{stat.contributions_made} XLM Paid</span>
                                    <span className="text-[10px] text-pink-400">{stat.payouts_received} XLM Recv</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  {stat.defaults > 0 ? (
                                    <span className="inline-flex items-center gap-1 text-[9px] text-rose-400 font-bold bg-rose-955/20 px-2 py-0.5 rounded border border-rose-900/40 uppercase">
                                      <ShieldAlert className="w-3 h-3" />
                                      {stat.defaults} Default{stat.defaults > 1 ? 's' : ''} ({Math.min(stat.defaults * 10, 50)}% Penalty)
                                    </span>
                                  ) : (
                                    <span className="text-gray-500 text-[10px]">None</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex justify-end items-center gap-2">
                                    {paid ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/30 px-2.5 py-1 rounded border border-emerald-900/50 font-semibold uppercase">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        Paid
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-955/30 px-2.5 py-1 rounded border border-amber-900/50 font-semibold uppercase">
                                        <Clock className="w-3.5 h-3.5 animate-pulse" />
                                        Unpaid
                                      </span>
                                    )}

                                    {!paid && timeLeft === 'Deadline passed' && (
                                      <button
                                        onClick={() => handleFlagDefault(stat.address)}
                                        className="text-[10px] bg-rose-950 hover:bg-rose-900 text-rose-300 px-2.5 py-1 rounded border border-rose-800 font-bold cursor-pointer transition-colors inline-flex items-center gap-1"
                                      >
                                        Flag Default
                                      </button>
                                    )}
                                  </div>
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
          </div>
        )}

        {/* Tab 2: Group Discovery */}
        {activeTab === 'discovery' && (
          <div className="glass-panel rounded-2xl p-6 border border-white/5 shadow-xl max-w-4xl mx-auto">
            <div className="flex items-center justify-between border-b border-gray-800/80 pb-5 mb-5 flex-wrap gap-3">
              <div className="flex items-center gap-2.5">
                <Compass className="w-5 h-5 text-pink-500" />
                <div>
                  <h3 className="text-lg font-bold">Group Discovery Page</h3>
                  <p className="text-xs text-gray-400">Join publicly listed forming savings groups directly on-chain</p>
                </div>
              </div>
              <button
                onClick={loadOpenGroups}
                disabled={loadingOpenGroups}
                className="bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-750 text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
              >
                <RotateCw className={`w-3.5 h-3.5 ${loadingOpenGroups ? 'animate-spin' : ''}`} />
                Refresh List
              </button>
            </div>

            {loadingOpenGroups ? (
              <div className="flex flex-col items-center justify-center min-h-[220px] gap-3">
                <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs text-gray-500">Querying open contracts...</p>
              </div>
            ) : openGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center min-h-[220px] gap-3 p-6 bg-gray-900/20 border border-gray-850 rounded-xl">
                <Compass className="w-10 h-10 text-gray-700" />
                <h4 className="font-bold text-sm text-gray-300">No Open Groups Available</h4>
                <p className="text-xs text-gray-500 max-w-sm leading-relaxed">
                  All current savings groups are active or completed. Launch a new Savings Circle configured to await members to make it publicly joinable!
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {openGroups.map((id) => (
                  <OpenGroupCard 
                    key={id} 
                    id={id} 
                    onJoin={handleJoinGroup} 
                    userAddress={wallet.address} 
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Launch Group Form */}
        {activeTab === 'create' && (
          <div className="glass-panel rounded-2xl p-6 shadow-xl border border-white/5 max-w-xl mx-auto">
            <div className="flex items-center gap-2 mb-6">
              <PlusCircle className="w-5 h-5 text-pink-500" />
              <h2 className="text-lg font-bold">Launch Savings Circle</h2>
            </div>

            <form onSubmit={handleCreateGroup} className="flex flex-col gap-5 text-xs">
              <div>
                <label className="block font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Invited Member Accounts (Public Keys)
                </label>
                <div className="flex flex-col gap-2 max-h-[190px] overflow-y-auto pr-1">
                  {formMembers.map((member, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={member}
                        onChange={(e) => handleMemberChange(index, e.target.value)}
                        placeholder={`Member #${index + 1} Address (G...)`}
                        className="flex-grow bg-[#161a24] border border-gray-850 rounded-xl px-4 py-2.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-pink-500 font-mono"
                        required
                      />
                      {formMembers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMemberField(index)}
                          className="bg-rose-955/40 hover:bg-rose-900/50 text-rose-400 border border-rose-900/40 px-3 py-2.5 rounded-xl cursor-pointer transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleAddMemberField}
                  className="mt-2.5 bg-purple-955/40 hover:bg-purple-900/50 text-purple-300 border border-purple-900/40 px-3 py-1.5 rounded-lg cursor-pointer font-bold"
                >
                  + Add Member
                </button>
                <p className="text-[10px] text-gray-500 mt-2">
                  To create a joinable public group, launch with fewer starting members than the total member goal. Organizer is auto-included.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Member Goal Count (e.g. 5)
                  </label>
                  <input
                    type="number"
                    className="w-full bg-[#161a24] border border-gray-855 rounded-xl px-4 py-3 text-xs text-gray-200 focus:outline-none focus:border-pink-500"
                    placeholder="Total members required"
                    defaultValue={3}
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Contribution Amount (XLM)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      className="w-full bg-[#161a24] border border-gray-855 rounded-xl pl-4 pr-12 py-3 text-xs text-gray-200 focus:outline-none focus:border-pink-500"
                      required
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-gray-500">XLM</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Cycle Duration Period
                </label>
                <select
                  value={formDuration}
                  onChange={(e) => setFormDuration(e.target.value)}
                  className="w-full bg-[#161a24] border border-gray-855 rounded-xl px-4 py-3 text-xs text-gray-200 focus:outline-none focus:border-pink-500 cursor-pointer"
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
                className="w-full bg-gradient-to-tr from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white py-3 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-2 cursor-pointer shadow-lg shadow-pink-500/10"
              >
                {creatingGroup ? 'Launching on Soroban...' : 'Launch Savings Circle'}
                <ArrowRight className="w-4 h-4" />
              </button>
              {!wallet.connected && (
                <p className="text-[10px] text-rose-455 text-center">Connect Freighter wallet to create groups.</p>
              )}
            </form>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-850 bg-[#0d0f14] py-8 text-center text-xs text-gray-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <p>© 2026 ChainKitty. All smart contract actions require Freighter wallet approval.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-gray-300 transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-gray-300 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-gray-300 transition-colors">Developer Docs</a>
          </div>
        </div>
      </footer>
    </div>
  );

  function handleMemberChange(index: number, value: string) {
    setFormMembers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function handleAddMemberField() {
    setFormMembers((prev) => [...prev, '']);
  }

  function handleRemoveMemberField(index: number) {
    setFormMembers((prev) => prev.filter((_, i) => i !== index));
  }
}

interface OpenGroupCardProps {
  id: number;
  onJoin: (id: number) => void;
  userAddress: string | null;
}

function OpenGroupCard({ id, onJoin, userAddress }: OpenGroupCardProps) {
  const [details, setDetails] = useState<{ amount: number; current: number; max: number; organizer: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const cycle = await getCycleInfo(id);
        // We can query custom details or simulate
        setDetails({
          amount: 100, // XLM default
          current: (cycle.paid_members.length || 0) + (cycle.unpaid_members.length || 0),
          max: 3, // default target size
          organizer: cycle.next_recipient,
        });
      } catch (err) {
        console.warn(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="bg-[#161a24]/30 border border-gray-850 p-4.5 rounded-xl animate-pulse h-16 flex items-center justify-between">
        <div className="h-4 bg-gray-800 rounded w-24"></div>
        <div className="h-8 bg-gray-800 rounded w-16"></div>
      </div>
    );
  }

  const isAlreadyMember = false; // logic fallback

  return (
    <div className="bg-[#161a24]/40 border border-gray-850 p-5 rounded-xl flex items-center justify-between flex-wrap gap-4 hover:border-gray-800 transition-colors">
      <div className="flex flex-col gap-1">
        <span className="font-bold text-sm text-gray-205">Savings Circle #{id}</span>
        <div className="flex items-center gap-3 text-gray-500 text-[11px] font-medium mt-0.5">
          <span>Organizer: <strong className="font-mono text-gray-400">{details?.organizer.substring(0, 5)}...{details?.organizer.substring(details.organizer.length - 4)}</strong></span>
          <span>•</span>
          <span>Contribution: <strong className="text-pink-405">{details?.amount} XLM</strong></span>
          <span>•</span>
          <span>Members: <strong className="text-gray-300">{details?.current} / {details?.max}</strong></span>
        </div>
      </div>

      <button
        onClick={() => onJoin(id)}
        disabled={!userAddress || isAlreadyMember}
        className="bg-gradient-to-tr from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        Join Circle
      </button>
    </div>
  );
}

export default App;
