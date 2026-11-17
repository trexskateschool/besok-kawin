export type Gender = 'Laki-laki' | 'Perempuan';
export type AnswerChoice = 'iya_lagi' | 'kayanya_sih' | 'engga';
export type QuestionCategory = 'Ketakutan Hidup' | 'Kebiasaan Buruk' | 'Sifat Jelek';
export type GameMode = 'solo' | 'couple';
export type RoomStatus = 'waiting_partner' | 'answering' | 'playing' | 'finished';
export type EndingTitle = 'BESOK KAWIN' | 'PACARAN DULU AJA' | 'STOP THE WEDDING';

export interface QuestionItem {
  id: string;
  category: QuestionCategory;
  genderTarget: 'universal' | Gender;
  ageTarget: '18-35' | '18-25' | '26-35';
  statement: string;
  consequenceSeed: string;
}

export interface PlayerAnswer {
  questionId: string;
  statement: string;
  category: QuestionCategory;
  consequenceSeed: string;
  choice: AnswerChoice;
}

export interface PlayerProfile {
  id: string;
  name: string;
  email: string;
  gender: Gender;
  age: number;
  answers: PlayerAnswer[];
  isReady: boolean;
}

export interface TurnLog {
  round: number;
  actorName: string;
  cardStatement: string;
  action: 'terima_mantap' | 'terima_menyesal' | 'tolak_sepakat' | 'tolak_deadlock' | 'timeout';
  delta: number;
  note: string;
}

export interface ActiveTurn {
  round: number;
  activePlayerId: string;
  sourcePlayerId: string;
  card: PlayerAnswer;
  phase: 'decision' | 'consequence' | 'negotiating';
  consequenceText?: string;
  compromiseOptions?: string[];
  votes: Record<string, number>;
  turnStartedAt: number;
}

export interface GameRoom {
  roomCode: string;
  mode: GameMode;
  status: RoomStatus;
  loveBattery: number;
  consecutiveTimeouts: number;
  host: PlayerProfile;
  guest: PlayerProfile | null;
  botAge?: number;
  deck: { card: PlayerAnswer; ownerId: string }[];
  currentTurn: ActiveTurn | null;
  logs: TurnLog[];
  ending?: {
    title: EndingTitle;
    subtitle: string;
  };
}

export interface MatchHistoryItem {
  id: string;
  roomCode: string;
  mode: GameMode;
  partnerName: string;
  partnerAge: number;
  loveBattery: number;
  endingTitle: EndingTitle;
  endingSubtitle: string;
  totalRounds: number;
  playedAt: number;
}

export interface UserDocument {
  uid: string;
  email: string;
  name?: string;
  gender?: Gender;
  age?: number;
  history: MatchHistoryItem[];
  updatedAt: number;
}
