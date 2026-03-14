import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';

export interface UserStats {
  xp: number;
  level: number;
  streak: number;
}

export const initUser = async (uid: string, displayName?: string | null, photoURL?: string | null): Promise<UserStats> => {
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  const today = new Date().toISOString().split('T')[0];
  
  if (!snap.exists()) {
    const initialStats = {
      uid, 
      displayName: displayName || 'Anonymous', 
      photoURL: photoURL || '', 
      xp: 0, 
      level: 1, 
      streak: 1, 
      lastLoginDate: today, 
      joinedRooms: []
    };
    await setDoc(userRef, initialStats);
    return { xp: 0, level: 1, streak: 1 };
  } else {
    const data = snap.data();
    let newStreak = data.streak || 1;
    const lastLogin = data.lastLoginDate;
    
    if (lastLogin !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      if (lastLogin === yesterdayStr) {
        newStreak++;
      } else {
        newStreak = 1; // Reset streak
      }
      await updateDoc(userRef, { streak: newStreak, lastLoginDate: today });
    }
    return { xp: data.xp || 0, level: data.level || 1, streak: newStreak };
  }
};

export const addXP = async (uid: string, amount: number, currentXp: number, currentLevel: number): Promise<UserStats> => {
  const newXp = currentXp + amount;
  const nextLevelXp = currentLevel * 100;
  let newLevel = currentLevel;
  
  const updates: any = { xp: increment(amount) };
  if (newXp >= nextLevelXp) {
    newLevel++;
    updates.level = increment(1);
  }
  
  await updateDoc(doc(db, 'users', uid), updates);
  return { xp: newXp, level: newLevel, streak: 0 }; // streak is managed separately
};
