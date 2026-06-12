import { browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword, getAuth, setPersistence, signInWithEmailAndPassword, signOut } from "firebase/auth";
import {app} from "./app";

export const auth = getAuth(app);


export const signUp = (email:string,password:string)=>
    createUserWithEmailAndPassword(auth,email,password);

export const logIn = (email:string,password:string)=>
    signInWithEmailAndPassword(auth,email,password);

export const logOut = ()=>signOut(auth);

export const setAuthRememberMe = async (rememberMe: boolean) => {
    return setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence)
}
