/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { onAuthStateChanged, User, updateProfile } from 'firebase/auth';
import { doc, getDocFromServer, updateDoc, arrayUnion } from 'firebase/firestore';
import { auth, db } from './firebase';
import { SignIn } from './components/SignIn';
import { ChatRoom } from './components/ChatRoom';
import { Sidebar } from './components/Sidebar';
import { initUser, UserStats } from './services/userService';
import { motion, AnimatePresence } from 'motion/react';
import { X, Loader2 } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [roomId, setRoomId] = useState<string>('public');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newDisplayName.trim() || newDisplayName === user.displayName) return;
    
    setIsUpdatingProfile(true);
    try {
      await updateProfile(user, { displayName: newDisplayName.trim() });
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: newDisplayName.trim()
      });
      setUser({ ...user, displayName: newDisplayName.trim() } as User);
      setIsSettingsOpen(false);
    } catch (error) {
      console.error("Failed to update profile", error);
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      setRoomId(room);
    }

    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setRoomId(params.get('room') || 'public');
    };
    window.addEventListener('popstate', handlePopState);

    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const stats = await initUser(currentUser.uid, currentUser.displayName, currentUser.photoURL);
        setUserStats(stats);
        
        // If joining a specific room via URL, add user to room members
        const currentRoomId = new URLSearchParams(window.location.search).get('room');
        if (currentRoomId && currentRoomId !== 'public') {
          try {
            await updateDoc(doc(db, 'rooms', currentRoomId), {
              members: arrayUnion(currentUser.uid)
            });
            await updateDoc(doc(db, 'users', currentUser.uid), {
              joinedRooms: arrayUnion(currentRoomId)
            });
          } catch (e) {
            console.error("Failed to join room automatically", e);
          }
        }
      }
      setLoading(false);
    });
    
    return () => {
      unsubscribe();
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const changeRoom = (newRoomId: string) => {
    setRoomId(newRoomId);
    if (newRoomId === 'public') {
      window.history.pushState({}, '', '/');
    } else {
      window.history.pushState({}, '', `/?room=${newRoomId}`);
    }
    setIsSidebarOpen(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-fuchsia-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-zinc-950 text-white font-sans overflow-hidden flex flex-col md:flex-row">
      <AnimatePresence mode="wait">
        {user ? (
          <>
            {/* Mobile Sidebar Overlay */}
            <AnimatePresence>
              {isSidebarOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsSidebarOpen(false)}
                  className="fixed inset-0 bg-black/60 z-40 md:hidden"
                />
              )}
            </AnimatePresence>

            {/* Sidebar */}
            <motion.div
              className={`absolute md:relative z-50 h-full transition-transform duration-300 ${
                isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
              }`}
            >
              <Sidebar 
                user={user} 
                currentRoomId={roomId} 
                onChangeRoom={changeRoom} 
                onCreateRoomClick={() => {
                  setIsCreatingRoom(true);
                  setIsSidebarOpen(false);
                }}
                onOpenSettings={() => {
                  setNewDisplayName(user.displayName || '');
                  setIsSettingsOpen(true);
                }}
                userStats={userStats}
              />
            </motion.div>

            {/* Main Chat Area */}
            <motion.div
              key={`chat-${roomId}`}
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -10 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="flex-1 flex flex-col h-full min-w-0"
            >
              <ChatRoom 
                key={roomId} 
                user={user} 
                roomId={roomId} 
                onChangeRoom={changeRoom} 
                onMenuClick={() => setIsSidebarOpen(true)}
                isCreatingRoom={isCreatingRoom}
                setIsCreatingRoom={setIsCreatingRoom}
                userStats={userStats}
                setUserStats={setUserStats}
              />
            </motion.div>

            {/* Settings Modal */}
            <AnimatePresence>
              {isSettingsOpen && (
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
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-xl font-bold text-white">Settings</h2>
                      <button onClick={() => setIsSettingsOpen(false)} className="text-zinc-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    
                    <form onSubmit={handleUpdateProfile} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">Display Name</label>
                        <input
                          type="text"
                          value={newDisplayName}
                          onChange={(e) => setNewDisplayName(e.target.value)}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
                          placeholder="Your display name"
                          maxLength={30}
                        />
                      </div>
                      
                      <div className="flex justify-end gap-3 mt-6">
                        <button
                          type="button"
                          onClick={() => setIsSettingsOpen(false)}
                          className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isUpdatingProfile || !newDisplayName.trim() || newDisplayName === user.displayName}
                          className="px-4 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-fuchsia-600 to-cyan-600 text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                        >
                          {isUpdatingProfile && <Loader2 className="w-4 h-4 animate-spin" />}
                          Save Changes
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : (
          <motion.div
            key="signin"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex items-center justify-center p-4 w-full"
          >
            <SignIn />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
