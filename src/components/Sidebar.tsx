import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { User } from 'firebase/auth';
import { Globe, Hash, PlusCircle, Flame, Star, Trophy, Settings } from 'lucide-react';
import { UserStats } from '../services/userService';

interface SidebarProps {
  user: User;
  currentRoomId: string;
  onChangeRoom: (roomId: string) => void;
  onCreateRoomClick: () => void;
  onOpenSettings: () => void;
  userStats: UserStats | null;
}

interface RoomItem {
  id: string;
  name: string;
  theme?: string;
}

export function Sidebar({ user, currentRoomId, onChangeRoom, onCreateRoomClick, onOpenSettings, userStats }: SidebarProps) {
  const [privateRooms, setPrivateRooms] = useState<RoomItem[]>([]);
  const [publicRooms, setPublicRooms] = useState<RoomItem[]>([]);

  useEffect(() => {
    // Query rooms where the current user is in the members array
    const qPrivate = query(
      collection(db, 'rooms'), 
      where('members', 'array-contains', user.uid)
    );
    const unsubscribePrivate = onSnapshot(qPrivate, (snapshot) => {
      const rooms: RoomItem[] = [];
      snapshot.forEach((doc) => {
        if (doc.data().visibility !== 'public') {
          rooms.push({ id: doc.id, name: doc.data().name, theme: doc.data().theme });
        }
      });
      setPrivateRooms(rooms);
    });

    // Query public rooms
    const qPublic = query(
      collection(db, 'rooms'), 
      where('visibility', '==', 'public')
    );
    const unsubscribePublic = onSnapshot(qPublic, (snapshot) => {
      const rooms: RoomItem[] = [];
      snapshot.forEach((doc) => {
        rooms.push({ id: doc.id, name: doc.data().name, theme: doc.data().theme });
      });
      setPublicRooms(rooms);
    });

    return () => {
      unsubscribePrivate();
      unsubscribePublic();
    };
  }, [user.uid]);

  return (
    <div className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col h-full flex-shrink-0">
      {/* User Profile & Stats */}
      <div className="p-4 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-3 mb-4">
          <img 
            src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} 
            alt="Profile" 
            className="w-10 h-10 rounded-full border border-zinc-700"
            referrerPolicy="no-referrer"
          />
          <div className="flex flex-col overflow-hidden flex-1">
            <span className="font-semibold text-sm truncate text-zinc-100">{user.displayName || 'Anonymous'}</span>
            <span className="text-xs text-zinc-500 truncate">{user.email}</span>
          </div>
          <button 
            onClick={onOpenSettings}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            title="User Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
        
        {userStats && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-zinc-800/50 rounded-lg p-2 flex flex-col items-center justify-center border border-zinc-700/50">
              <Trophy className="w-4 h-4 text-yellow-500 mb-1" />
              <span className="text-xs font-bold text-zinc-300">Lv {userStats.level}</span>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-2 flex flex-col items-center justify-center border border-zinc-700/50">
              <Star className="w-4 h-4 text-fuchsia-500 mb-1" />
              <span className="text-xs font-bold text-zinc-300">{userStats.xp} XP</span>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-2 flex flex-col items-center justify-center border border-zinc-700/50">
              <Flame className="w-4 h-4 text-orange-500 mb-1" />
              <span className="text-xs font-bold text-zinc-300">{userStats.streak}d</span>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto p-3 space-y-6">
        <div>
          <div className="flex items-center justify-between px-2 mb-2">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Public Rooms</h3>
            <button 
              onClick={onCreateRoomClick}
              className="text-zinc-400 hover:text-fuchsia-400 transition-colors"
              title="Create Room"
            >
              <PlusCircle className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-1">
            <button
              onClick={() => onChangeRoom('public')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                currentRoomId === 'public' 
                  ? 'bg-gradient-to-r from-fuchsia-600/20 to-cyan-600/20 text-white border border-fuchsia-500/30' 
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              <Globe className={`w-5 h-5 ${currentRoomId === 'public' ? 'text-cyan-400' : ''}`} />
              <span className="font-medium text-sm">Global Chat</span>
            </button>
            {publicRooms.length > 0 && (
              <button
                onClick={() => {
                  const randomRoom = publicRooms[Math.floor(Math.random() * publicRooms.length)];
                  onChangeRoom(randomRoom.id);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 hover:text-white border border-zinc-700/50"
              >
                <div className="w-5 h-5 flex items-center justify-center text-lg">🎲</div>
                <span className="font-medium text-sm">Join Random Room</span>
              </button>
            )}
            {publicRooms.map(room => (
              <button
                key={room.id}
                onClick={() => onChangeRoom(room.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                  currentRoomId === room.id 
                    ? 'bg-zinc-800 text-white border border-zinc-700' 
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                }`}
              >
                <Hash className="w-4 h-4 opacity-50" />
                <div className="flex flex-col items-start overflow-hidden">
                  <span className="font-medium text-sm truncate w-full text-left">{room.name}</span>
                  {room.theme && <span className="text-[10px] text-zinc-500 truncate w-full text-left">{room.theme}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between px-2 mb-2">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Private Rooms</h3>
          </div>
          <div className="space-y-1">
            {privateRooms.length === 0 ? (
              <p className="text-xs text-zinc-600 px-2 italic">No private rooms yet.</p>
            ) : (
              privateRooms.map(room => (
                <button
                  key={room.id}
                  onClick={() => onChangeRoom(room.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                    currentRoomId === room.id 
                      ? 'bg-zinc-800 text-white border border-zinc-700' 
                      : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                  }`}
                >
                  <Hash className="w-4 h-4 opacity-50" />
                  <div className="flex flex-col items-start overflow-hidden">
                    <span className="font-medium text-sm truncate w-full text-left">{room.name}</span>
                    {room.theme && <span className="text-[10px] text-zinc-500 truncate w-full text-left">{room.theme}</span>}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
