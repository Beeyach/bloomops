import styles from './NotificationInbox.module.css';
export default function NotificationLoading(){return <div className={styles.page} role="status" aria-label="Loading notifications"><div className={styles.skeleton}/><div className={styles.skeleton}/><div className={styles.skeleton}/></div>;}
