/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDocFromServer, updateDoc, arrayUnion } from 'firebase/firestore';
import { auth, db } from './firebase';
import { SignIn } from './components/SignIn';
import { ChatRoom } from './components/ChatRoom';
import { Sidebar } from './components/Sidebar';
import { initUser, UserStats } from './services/userService';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [roomId, setRoomId] = useState<string>('public');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

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
                userStats={userStats}
              />
            </motion.div>

            {/* Main Chat Area */}
            <motion.div
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
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
