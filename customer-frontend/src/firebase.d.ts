declare module 'firebase/firestore' {
  export class Timestamp {
    constructor(seconds: number, nanoseconds: number);
    seconds: number;
    nanoseconds: number;
    toDate(): Date;
    toMillis(): number;
    isEqual(other: Timestamp): boolean;
    static now(): Timestamp;
    static fromDate(date: Date): Timestamp;
    static fromMillis(milliseconds: number): Timestamp;
  }
  export const doc: any;
  export const getDoc: any;
  export const getDocs: any;
  export const collection: any;
  export const setDoc: any;
  export const addDoc: any;
  export const updateDoc: any;
  export const deleteDoc: any;
  export const query: any;
  export const where: any;
  export const orderBy: any;
  export const limit: any;
}
