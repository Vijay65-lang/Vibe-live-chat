import React, { useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, Timestamp, where, doc, getDocFromServer, updateDoc, arrayUnion, arrayRemove, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { ChatMessage } from './ChatMessage';
import { Send, LogOut, Loader2, Share2, Globe, PlusCircle, X, Menu, Users, Trash2, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { addXP, UserStats } from '../services/userService';
import { moderateMessage, ModerationResult } from '../services/moderationService';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface ChatRoomProps {
  key?: string;
  user: User;
  roomId: string;
  onChangeRoom: (roomId: string) => void;
  onMenuClick: () => void;
  isCreatingRoom: boolean;
  setIsCreatingRoom: (val: boolean) => void;
  userStats: UserStats | null;
  setUserStats: React.Dispatch<React.SetStateAction<UserStats | null>>;
}

export interface MessageData {
  id: string;
  text: string;
  uid: string;
  displayName: string;
  photoURL: string;
  createdAt: any;
  createdAtMs: number;
  reactions?: Record<string, string[]>;
  level?: number;
  isHighlighted?: boolean;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const DAILY_QUESTIONS = [
  "What's the best movie you've seen recently?",
  "If you could travel anywhere right now, where would you go?",
  "What's your favorite coding language and why?",
  "Pineapple on pizza: Yes or No?",
  "What's a skill you want to learn this year?",
  "What's your favorite video game of all time?",
  "If you had a superpower, what would it be?"
];

const CONVERSATION_STARTERS = [
  "What's everyone working on today?",
  "Any good book or movie recommendations?",
  "What's the most interesting thing you learned this week?",
  "If you could have any animal as a pet, what would it be?",
  "What's your favorite way to relax after a long day?",
  "Coffee or tea? Discuss!",
  "What's a tech trend you're really excited about?"
];

export function ChatRoom({ user, roomId, onChangeRoom, onMenuClick, isCreatingRoom, setIsCreatingRoom, userStats, setUserStats }: ChatRoomProps) {
  const [roomName, setRoomName] = useState<string>(roomId === 'public' ? 'Public Chat' : 'Loading...');
  const [roomCreator, setRoomCreator] = useState<string | null>(null);
  const [roomVisibility, setRoomVisibility] = useState<'public' | 'private'>('private');
  const [roomTheme, setRoomTheme] = useState<string | null>(null);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomVisibility, setNewRoomVisibility] = useState<'public' | 'private'>('private');
  const [newRoomTheme, setNewRoomTheme] = useState('Casual Chat');
  const [memberCount, setMemberCount] = useState<number>(0);
  const dailyQuestion = DAILY_QUESTIONS[new Date().getDay()];

  // Moderation state
  const [isModerating, setIsModerating] = useState(false);
  const [moderationWarning, setModerationWarning] = useState<ModerationResult | null>(null);
  const [pendingMessage, setPendingMessage] = useState('');

  // AI Conversation Starter
  const [conversationStarter, setConversationStarter] = useState<string | null>(null);

  // Modals state
  const [isDeletingRoom, setIsDeletingRoom] = useState(false);
  const [isDeletingMessage, setIsDeletingMessage] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  // 1. Initialize from Local Storage & filter > 24h
  const [messages, setMessages] = useState<MessageData[]>(() => {
    try {
      const saved = localStorage.getItem(`vibe_chat_messages_${roomId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        const now = Date.now();
        // Filter out messages older than 24 hours from local storage
        return parsed.filter((m: MessageData) => now - m.createdAtMs < ONE_DAY_MS);
      }
    } catch (e) {
      console.error("Failed to parse local storage messages", e);
    }
    return [];
  });
  
  const [formValue, setFormValue] = useState('');
  const [messageLimit, setMessageLimit] = useState(30);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  const dummy = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeight = useRef<number>(0);

  // Fetch Room Metadata
  useEffect(() => {
    if (roomId === 'public') {
      setRoomName('Public Chat');
      setRoomCreator(null);
      setRoomVisibility('public');
      setRoomTheme('Global');
      return;
    }
    
    const unsubscribe = onSnapshot(doc(db, 'rooms', roomId), (roomDoc) => {
      if (roomDoc.exists()) {
        setRoomName(roomDoc.data().name);
        setRoomCreator(roomDoc.data().creatorUid);
        setRoomVisibility(roomDoc.data().visibility || 'private');
        setRoomTheme(roomDoc.data().theme || null);
        setMemberCount(roomDoc.data().members?.length || 0);
      } else {
        setRoomName('Unknown Room');
      }
    }, (error) => {
      console.error("Error fetching room", error);
      setRoomName('Private Room');
    });

    return () => unsubscribe();
  }, [roomId]);

  // 2. Save to local storage whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(`vibe_chat_messages_${roomId}`, JSON.stringify(messages));
    }
  }, [messages, roomId]);

  // 3. Firestore Listener with Pagination & 24h Filter
  useEffect(() => {
    const messagesRef = collection(db, 'rooms', roomId, 'messages');
    const oneDayAgo = Timestamp.fromDate(new Date(Date.now() - ONE_DAY_MS));
    
    // Query: Only messages from the last 24 hours, ordered by newest, limited for pagination
    const q = query(
      messagesRef, 
      where('createdAt', '>=', oneDayAgo),
      orderBy('createdAt', 'desc'), 
      limit(messageLimit)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: MessageData[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        msgs.push({ 
          id: doc.id, 
          ...data,
          createdAtMs: data.createdAt?.toMillis() || Date.now()
        } as MessageData);
      });
      
      setHasMore(snapshot.docs.length === messageLimit);
      const reversedMsgs = msgs.reverse();
      setMessages(reversedMsgs);
      setIsLoadingMore(false);

      // Check for inactivity (e.g., last message was > 5 mins ago)
      if (reversedMsgs.length > 0) {
        const lastMsgTime = reversedMsgs[reversedMsgs.length - 1].createdAtMs;
        if (Date.now() - lastMsgTime > 5 * 60 * 1000) {
          setConversationStarter(CONVERSATION_STARTERS[Math.floor(Math.random() * CONVERSATION_STARTERS.length)]);
        } else {
          setConversationStarter(null);
        }
      } else {
        setConversationStarter(CONVERSATION_STARTERS[Math.floor(Math.random() * CONVERSATION_STARTERS.length)]);
      }
      
      // Scroll handling
      setTimeout(() => {
        if (scrollContainerRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
          
          // If we just loaded more messages, maintain the scroll position
          if (prevScrollHeight.current > 0 && scrollTop === 0) {
            scrollContainerRef.current.scrollTop = scrollHeight - prevScrollHeight.current;
          } 
          // If we are already near the bottom, auto-scroll to the very bottom for new messages
          else if (scrollHeight - scrollTop - clientHeight < 200) {
            dummy.current?.scrollIntoView({ behavior: 'smooth' });
          }
          
          prevScrollHeight.current = scrollHeight;
        }
      }, 50);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `rooms/${roomId}/messages`);
    });

    return () => unsubscribe();
  }, [messageLimit, roomId]);

  // 4. Load older messages on scroll up
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight } = scrollContainerRef.current;
      // If scrolled to the top, load more
      if (scrollTop === 0 && hasMore && !isLoadingMore) {
        setIsLoadingMore(true);
        prevScrollHeight.current = scrollHeight;
        setMessageLimit(prev => prev + 30);
      }
    }
  };

  const handleSendMessageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValue.trim() || isModerating) return;

    const messageText = formValue;
    setIsModerating(true);

    // Moderate content
    const moderation = await moderateMessage(messageText);
    
    if (!moderation.isSafe) {
      setModerationWarning(moderation);
      setPendingMessage(messageText);
      setIsModerating(false);
      return;
    }

    await executeSendMessage(messageText);
    setIsModerating(false);
  };

  const executeSendMessage = async (text: string) => {
    const { uid, displayName, photoURL } = user;
    setFormValue(''); // Optimistic clear
    setModerationWarning(null);
    setPendingMessage('');
    
    // Optimistic scroll
    setTimeout(() => dummy.current?.scrollIntoView({ behavior: 'smooth' }), 50);

    try {
      await addDoc(collection(db, 'rooms', roomId, 'messages'), {
        text,
        uid,
        displayName: displayName || 'Anonymous',
        photoURL: photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
        createdAt: serverTimestamp(),
        level: userStats?.level || 1,
        isHighlighted: false
      });

      // Award XP
      if (userStats) {
        const newStats = await addXP(uid, 10, userStats.xp, userStats.level);
        setUserStats({ ...userStats, xp: newStats.xp, level: newStats.level });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `rooms/${roomId}/messages`);
    }
  };

  const handleReact = async (messageId: string, emoji: string) => {
    const msgRef = doc(db, 'rooms', roomId, 'messages', messageId);
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;

    const hasReacted = msg.reactions?.[emoji]?.includes(user.uid);
    
    try {
      const updates: any = {};
      
      // Remove user from all other reactions to ensure 1 reaction per user
      Object.keys(msg.reactions || {}).forEach(e => {
        if (e !== emoji && msg.reactions![e].includes(user.uid)) {
          updates[`reactions.${e}`] = arrayRemove(user.uid);
        }
      });

      if (hasReacted) {
        updates[`reactions.${emoji}`] = arrayRemove(user.uid);
      } else {
        updates[`reactions.${emoji}`] = arrayUnion(user.uid);
      }
      
      if (Object.keys(updates).length > 0) {
        await updateDoc(msgRef, updates);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomId}/messages`);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    setIsDeletingMessage(messageId);
  };

  const confirmDeleteMessage = async () => {
    if (!isDeletingMessage) return;
    try {
      await deleteDoc(doc(db, 'rooms', roomId, 'messages', isDeletingMessage));
      setIsDeletingMessage(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `rooms/${roomId}/messages`);
    }
  };

  const handleHighlightMessage = async (messageId: string) => {
    const msgRef = doc(db, 'rooms', roomId, 'messages', messageId);
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    try {
      await updateDoc(msgRef, {
        isHighlighted: !msg.isHighlighted
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomId}/messages`);
    }
  };

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    
    try {
      const roomRef = await addDoc(collection(db, 'rooms'), {
        name: newRoomName.trim(),
        creatorUid: user.uid,
        visibility: newRoomVisibility,
        theme: newRoomTheme,
        createdAt: serverTimestamp(),
        members: [user.uid]
      });
      setIsCreatingRoom(false);
      setNewRoomName('');
      setNewRoomVisibility('private');
      setNewRoomTheme('Casual Chat');
      onChangeRoom(roomRef.id);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'rooms');
    }
  };

  const deleteRoom = async () => {
    setIsDeletingRoom(true);
  };

  const confirmDeleteRoom = async () => {
    try {
      await deleteDoc(doc(db, 'rooms', roomId));
      setIsDeletingRoom(false);
      onChangeRoom('public');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `rooms/${roomId}`);
    }
  };

  const shareRoom = async () => {
    const url = `${window.location.origin}/?room=${roomId}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join my private chat: ${roomName}`,
          text: `Join me in ${roomName} on Vibe Live Chat!`,
          url: url,
        });
      } catch (err) {
        console.error("Error sharing", err);
      }
    } else {
      navigator.clipboard.writeText(url);
      setShareMessage("Room link copied to clipboard!");
      setTimeout(() => setShareMessage(null), 3000);
    }
  };

  const activeUsersCount = roomId === 'public' 
    ? new Set(messages.map(m => m.uid)).size 
    : memberCount;

  return (
    <div className="flex flex-col h-full bg-zinc-950 relative">
      {/* Header */}
      <header className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onMenuClick} className="md:hidden p-2 -ml-2 rounded-full hover:bg-zinc-800 text-zinc-400">
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-tr from-fuchsia-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-fuchsia-500/20">
            <span className="font-bold text-white text-lg md:text-xl">V</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg md:text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-fuchsia-400 to-cyan-400 truncate max-w-[150px] md:max-w-xs">
              {roomName}
            </h1>
            <div className="flex items-center gap-2">
              {roomTheme && (
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">{roomTheme}</span>
              )}
              {roomId !== 'public' && (
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">{roomVisibility}</span>
              )}
              <span className="text-[10px] text-zinc-500 flex items-center gap-1" title="Active Users">
                <Users className="w-3 h-3" /> {activeUsersCount} {roomId === 'public' ? 'active' : 'members'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 md:gap-2">
          {roomId !== 'public' && roomCreator === user.uid && (
            <>
              <button onClick={shareRoom} className="p-2 rounded-full hover:bg-zinc-800 text-fuchsia-400 hover:text-fuchsia-300 transition-colors" title="Share Room">
                <Share2 className="w-5 h-5" />
              </button>
              <button onClick={deleteRoom} className="p-2 rounded-full hover:bg-zinc-800 text-red-400 hover:text-red-300 transition-colors" title="Delete Room">
                <Trash2 className="w-5 h-5" />
              </button>
            </>
          )}
          <button
            onClick={() => auth.signOut()}
            className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Sign Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Daily Question Banner */}
      <div className="bg-gradient-to-r from-fuchsia-900/40 to-cyan-900/40 border-b border-fuchsia-500/20 px-4 py-2 flex items-center justify-center text-center">
        <p className="text-xs md:text-sm text-zinc-300">
          <span className="font-bold text-fuchsia-400 mr-2">Daily Question:</span>
          {dailyQuestion}
        </p>
      </div>

      {/* Messages Area */}
      <main 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-2 scroll-smooth"
      >
        {isLoadingMore && (
          <div className="flex justify-center py-4">
            <Loader2 className="w-6 h-6 text-fuchsia-500 animate-spin" />
          </div>
        )}
        
        {messages.length === 0 && !isLoadingMore && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4">
            <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center">
              <Send className="w-8 h-8 opacity-50" />
            </div>
            <p>No messages in the last 24 hours. Be the first!</p>
          </div>
        )}

        {messages.length > 0 && (
          <div className="text-center my-6">
            <span className="bg-zinc-800/50 text-zinc-400 text-xs px-3 py-1 rounded-full">
              Welcome to {roomName}! Keep it friendly and fun.
            </span>
          </div>
        )}

        {messages.map((msg, index) => (
          <ChatMessage 
            key={msg.id} 
            message={msg} 
            isOwn={msg.uid === user.uid} 
            isSequential={index > 0 && messages[index - 1].uid === msg.uid}
            onReact={handleReact}
            onDelete={handleDeleteMessage}
            onHighlight={handleHighlightMessage}
            currentUserId={user.uid}
          />
        ))}

        {conversationStarter && messages.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center my-6"
          >
            <div className="bg-gradient-to-r from-cyan-500/10 to-fuchsia-500/10 border border-cyan-500/20 rounded-2xl p-4 max-w-sm text-center">
              <p className="text-xs text-cyan-400 font-semibold mb-1 uppercase tracking-wider">Conversation Starter</p>
              <p className="text-sm text-zinc-300">{conversationStarter}</p>
            </div>
          </motion.div>
        )}

        <div ref={dummy} className="h-1"></div>
      </main>

      {/* Input Area */}
      <footer className="p-3 md:p-4 bg-zinc-900/80 backdrop-blur-md border-t border-zinc-800">
        <form onSubmit={handleSendMessageSubmit} className="max-w-4xl mx-auto flex gap-2">
          <input
            value={formValue}
            onChange={(e) => setFormValue(e.target.value)}
            placeholder="Type your message..."
            disabled={isModerating}
            className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded-full px-4 md:px-6 py-2 md:py-3 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent text-white placeholder-zinc-500 transition-all text-sm md:text-base disabled:opacity-50"
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            type="submit"
            disabled={!formValue.trim() || isModerating}
            className="bg-gradient-to-r from-fuchsia-600 to-cyan-600 text-white rounded-full p-2 md:p-3 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-fuchsia-500/20"
          >
            {isModerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </motion.button>
        </form>
      </footer>

      {/* Moderation Warning Modal */}
      <AnimatePresence>
        {moderationWarning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4 text-orange-400">
                <ShieldAlert className="w-8 h-8" />
                <h2 className="text-xl font-bold">Let's keep it friendly!</h2>
              </div>
              <p className="text-zinc-300 mb-4 text-sm">
                Your message might be hurtful or inappropriate. <span className="text-zinc-500 italic">({moderationWarning.reason})</span>
              </p>
              
              {moderationWarning.suggestion && (
                <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 mb-6">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-2">Suggested Rewrite:</p>
                  <p className="text-zinc-200 italic">"{moderationWarning.suggestion}"</p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                {moderationWarning.suggestion && (
                  <button
                    onClick={() => executeSendMessage(moderationWarning.suggestion!)}
                    className="w-full bg-gradient-to-r from-fuchsia-600 to-cyan-600 text-white font-bold rounded-xl py-3 transition-transform active:scale-95"
                  >
                    Send Suggested Version
                  </button>
                )}
                <button
                  onClick={() => {
                    setFormValue(pendingMessage);
                    setModerationWarning(null);
                  }}
                  className="w-full bg-zinc-800 text-white font-bold rounded-xl py-3 hover:bg-zinc-700 transition-colors"
                >
                  Edit My Message
                </button>
                <button
                  onClick={() => setModerationWarning(null)}
                  className="w-full text-zinc-500 text-sm py-2 hover:text-zinc-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share Toast */}
      <AnimatePresence>
        {shareMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 bg-zinc-800 text-white px-4 py-2 rounded-full shadow-lg text-sm border border-zinc-700"
          >
            {shareMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Room Modal */}
      <AnimatePresence>
        {isDeletingRoom && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            >
              <h2 className="text-xl font-bold text-white mb-2">Delete Room?</h2>
              <p className="text-zinc-400 text-sm mb-6">Are you sure you want to delete "{roomName}"? This action cannot be undone.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsDeletingRoom(false)}
                  className="flex-1 bg-zinc-800 text-white font-medium rounded-xl py-2.5 hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteRoom}
                  className="flex-1 bg-red-500/20 text-red-500 border border-red-500/50 font-medium rounded-xl py-2.5 hover:bg-red-500/30 transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Message Modal */}
      <AnimatePresence>
        {isDeletingMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            >
              <h2 className="text-xl font-bold text-white mb-2">Delete Message?</h2>
              <p className="text-zinc-400 text-sm mb-6">Are you sure you want to delete this message?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsDeletingMessage(null)}
                  className="flex-1 bg-zinc-800 text-white font-medium rounded-xl py-2.5 hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteMessage}
                  className="flex-1 bg-red-500/20 text-red-500 border border-red-500/50 font-medium rounded-xl py-2.5 hover:bg-red-500/30 transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Room Modal */}
      <AnimatePresence>
        {isCreatingRoom && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white">Create Room</h2>
                <button onClick={() => setIsCreatingRoom(false)} className="text-zinc-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={createRoom} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Room Name</label>
                  <input
                    autoFocus
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="e.g. Secret Squad"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Visibility</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setNewRoomVisibility('public')}
                      className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${
                        newRoomVisibility === 'public'
                          ? 'bg-fuchsia-600/20 border-fuchsia-500 text-fuchsia-400'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:bg-zinc-800'
                      }`}
                    >
                      Public
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewRoomVisibility('private')}
                      className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${
                        newRoomVisibility === 'private'
                          ? 'bg-fuchsia-600/20 border-fuchsia-500 text-fuchsia-400'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:bg-zinc-800'
                      }`}
                    >
                      Private
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-2">
                    {newRoomVisibility === 'public' 
                      ? 'Anyone can see and join this room.' 
                      : 'Only people with the link can join this room.'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Theme</label>
                  <select
                    value={newRoomTheme}
                    onChange={(e) => setNewRoomTheme(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-500 appearance-none"
                  >
                    <option value="Casual Chat">Casual Chat</option>
                    <option value="Gaming">Gaming</option>
                    <option value="Study">Study</option>
                    <option value="Movies">Movies</option>
                    <option value="Tech">Tech</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={!newRoomName.trim()}
                  className="w-full bg-gradient-to-r from-fuchsia-600 to-cyan-600 text-white font-bold rounded-xl py-3 disabled:opacity-50 transition-transform active:scale-95 mt-4"
                >
                  Create & Join
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
