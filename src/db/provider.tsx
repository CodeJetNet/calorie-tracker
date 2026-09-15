import * as SQLite from 'expo-sqlite';
import * as FS from 'expo-file-system/legacy';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { wrap } from './expo';
import type { Db } from './types';
import { migrate } from './diary';
import { FOODS_DIR, FOODS_FILE, installStarter } from '../foods/update';

type Ctx = { diary: Db; foods: Db | null; closeFoods(): Promise<void>; reopenFoods(): Promise<void> };
const DbContext = createContext<Ctx | null>(null);

export function DbProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  useEffect(() => {
    (async () => {
      const diaryRaw = await SQLite.openDatabaseAsync('diary.db');
      await diaryRaw.execAsync('PRAGMA journal_mode = WAL');
      const diary = wrap(diaryRaw);
      await migrate(diary);
      let foodsRaw: SQLite.SQLiteDatabase | null = null;
      const openFoods = async () => {
        if (!(await FS.getInfoAsync(FOODS_DIR + FOODS_FILE)).exists) await installStarter();   // first launch
        foodsRaw = await SQLite.openDatabaseAsync(FOODS_FILE);
        return wrap(foodsRaw);
      };
      const foods = await openFoods().catch(() => null);   // no starter asset or a corrupt file: run diary-only rather than blank
      const make = (foods: Db | null): Ctx => ({
        diary, foods,
        closeFoods: async () => { await foodsRaw?.closeAsync(); foodsRaw = null; setCtx(make(null)); },
        reopenFoods: async () => { setCtx(make(await openFoods())); },
      });
      setCtx(make(foods));
    })();
  }, []);
  if (!ctx) return null;
  return <DbContext.Provider value={ctx}>{children}</DbContext.Provider>;
}

export function useDb(): Ctx {
  const c = useContext(DbContext);
  if (!c) throw new Error('useDb outside DbProvider');
  return c;
}
