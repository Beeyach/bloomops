import styles from './RecordDiscussion.module.css';
export default function DiscussionLoading(){return <div className={styles.page} role="status" aria-label="Loading discussion"><h1 className="bo-h1">Discussion</h1><div className={styles.skeleton} aria-hidden="true"/><div className={styles.skeleton} aria-hidden="true"/><span className="sr-only">Loading discussion…</span></div>;}
