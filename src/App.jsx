import { useState, useEffect, useRef } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import './App.css';
import { db, auth } from './firebase';
import {
  collection, addDoc, onSnapshot, query, doc,
  updateDoc, deleteDoc, setDoc, where, getDocs
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import liff from '@line/liff';

const WORKER_URL = 'https://imas-line-calender.kentatoonimusya.workers.dev';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userId, setUserId] = useState(null);
  const [liffToken, setLiffToken] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [events, setEvents] = useState({});
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventType, setNewEventType] = useState('event');
  const [toast, setToast] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingType, setEditingType] = useState('event');
  const [editingUrl, setEditingUrl] = useState('');
  const [editingMemo, setEditingMemo] = useState('');
  const [newEventUrl, setNewEventUrl] = useState('');
  const [newEventMemo, setNewEventMemo] = useState('');
  const [newEventBrand, setNewEventBrand] = useState('');
  const [newEventStart, setNewEventStart] = useState('');
  const [newEventEnd, setNewEventEnd] = useState('');
  const [newEventTicketKind, setNewEventTicketKind] = useState('');
  const [newEventDeadline, setNewEventDeadline] = useState('');
  const [editingBrand, setEditingBrand] = useState('');
  const [editingStart, setEditingStart] = useState('');
  const [editingEnd, setEditingEnd] = useState('');
  const [editingTicketKind, setEditingTicketKind] = useState('');
  const [editingDeadline, setEditingDeadline] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [membersMap, setMembersMap] = useState({}); // { userId: displayName }
  const [authReady, setAuthReady] = useState(false);

  const eventsCollectionRef = useRef(collection(db, 'events')).current;

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2800);
  };

  // LIFF初期化 + 匿名認証 + メンバー登録 + 古い予定削除
  useEffect(() => {
    (async () => {
      try {
        await liff.init({ liffId: "2010083936-tdIXgoSL" });
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        setCurrentUser(profile.displayName);
        setUserId(profile.userId);
        setLiffToken(liff.getIDToken());

        // Firebase匿名認証
        try {
          await signInAnonymously(auth);
          setAuthReady(true);
        } catch (e) {
          console.error('匿名認証失敗', e);
          showToast('Firebase認証に失敗しました。再読み込みをお試しください', 'error');
        }

        // メンバー情報をFirestoreに登録（通知の宛先になる）
        // グループトーク内から開いた場合のみ登録する。1:1チャットや外部ブラウザ経由の
        // 古いリンクから開いた場合まで登録すると、グループを退出した人が復活してしまう。
        const context = liff.getContext();
        if (context?.type === 'group') {
          try {
            await setDoc(doc(db, 'members', profile.userId), {
              userId: profile.userId,
              displayName: profile.displayName,
              updatedAt: new Date(),
            }, { merge: true });
          } catch (e) {
            console.error('メンバー登録失敗', e);
          }
        }

        // 30日以上前の予定を自動削除
        try {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - 30);
          const cutoffStr = cutoff.toISOString().split('T')[0];
          const oldSnap = await getDocs(query(eventsCollectionRef, where('dateStr', '<', cutoffStr)));
          await Promise.all(oldSnap.docs.map(d => deleteDoc(d.ref)));
        } catch (e) {
          console.error('古い予定の削除失敗', e);
        }

        // URLパラメータから日付を読んでモーダルを開く
        const params = new URLSearchParams(window.location.search);
        const dateParam = params.get('date');
        if (dateParam) {
          const [y, m, d] = dateParam.split('-').map(Number);
          setSelectedDate(new Date(y, m - 1, d));
        }
      } catch (err) {
        console.error("LIFF初期化失敗", err);
        showToast("LINE接続に失敗しました", 'error');
      }
    })();
  }, [eventsCollectionRef]);

  // membersコレクションをリアルタイム取得（userId → displayName の変換に使う）
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'members'), (snapshot) => {
      const m = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.userId) m[data.userId] = data.displayName;
      });
      setMembersMap(m);
    });
    return () => unsubscribe();
  }, []);

  // 予定をリアルタイム取得 + createdAt順ソート
  useEffect(() => {
    const unsubscribe = onSnapshot(query(eventsCollectionRef), (snapshot) => {
      const fetchedEvents = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const dateStr = data.dateStr;
        if (!fetchedEvents[dateStr]) fetchedEvents[dateStr] = [];
        fetchedEvents[dateStr].push({ id: docSnap.id, ...data });
      });
      // 各日の予定を作成時刻順に並べる
      for (const k of Object.keys(fetchedEvents)) {
        fetchedEvents[k].sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() ?? new Date(a.createdAt || 0).getTime();
          const tb = b.createdAt?.toMillis?.() ?? new Date(b.createdAt || 0).getTime();
          return ta - tb;
        });
      }
      setEvents(fetchedEvents);
    });
    return () => unsubscribe();
  }, [eventsCollectionRef]);

  const formatDateStr = (date) => {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  };

  const canAddEvent = newEventTitle.trim() !== '' && !!currentUser;

  const callWorker = async (path, payload) => {
    try {
      const token = liff.getIDToken() || liffToken || '';
      await fetch(`${WORKER_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.error('Worker呼び出し失敗', path, e);
    }
  };

  const handleAddEvent = async () => {
    if (!canAddEvent) return;
    if (newEventStart && newEventEnd && newEventStart > newEventEnd) {
      showToast('開始日は終了日より前にしてください', 'error');
      return;
    }
    const dateKey = formatDateStr(selectedDate);
    try {
      await addDoc(eventsCollectionRef, {
        type: newEventType,
        title: newEventTitle,
        url: newEventUrl.trim(),
        memo: newEventMemo,
        brand: newEventBrand,
        eventStart: newEventStart,
        eventEnd: newEventEnd,
        ticketKind: newEventTicketKind,
        deadline: newEventDeadline,
        dateStr: dateKey,
        createdBy: currentUser,
        createdById: userId,
        responses: { [userId]: 'attend' },
        createdAt: new Date(),
      });
      const titleSnapshot = newEventTitle;
      setNewEventTitle('');
      setNewEventUrl('');
      setNewEventMemo('');
      setNewEventBrand('');
      setNewEventStart('');
      setNewEventEnd('');
      setNewEventTicketKind('');
      setNewEventDeadline('');
      showToast('予定を追加しました', 'success');
      callWorker('/notify', {
        title: titleSnapshot,
        date: dateKey,
        type: newEventType,
        eventStart: newEventStart,
        createdBy: currentUser,
        createdById: userId,
      });
    } catch (error) {
      console.error("保存失敗:", error);
      showToast('予定の追加に失敗しました', 'error');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAddEvent();
  };

  const handleResponse = async (ev, status) => {
    if (!currentUser || !userId) return;
    if (!authReady) {
      showToast('認証中です。少し待ってから再度お試しください', 'error');
      return;
    }
    try {
      // キーに userId を使う（表示名はドット等の特殊文字を含む場合があり
      // Firestoreのフィールドパスとして解釈されてしまうため）
      await updateDoc(doc(db, 'events', ev.id), {
        [`responses.${userId}`]: status
      });
      callWorker('/notify-response', {
        title: ev.title,
        date: ev.dateStr,
        type: ev.type,
        eventStart: ev.eventStart,
        status,
        userName: currentUser,
        userId,
      });
    } catch (error) {
      console.error("更新失敗:", error);
      const code = error?.code ?? error?.message ?? '不明なエラー';
      showToast(`更新に失敗しました (${code})`, 'error');
    }
  };

  const handleDeleteEvent = async (eventId) => {
    try {
      await deleteDoc(doc(db, 'events', eventId));
      setConfirmDelete(null);
      showToast('予定を削除しました', 'success');
    } catch (error) {
      console.error("削除失敗:", error);
      showToast('削除に失敗しました', 'error');
    }
  };

  const startEdit = (ev) => {
    setEditingId(ev.id);
    setEditingTitle(ev.title);
    setEditingType(ev.type);
    setEditingUrl(ev.url || '');
    setEditingMemo(ev.memo || '');
    setEditingBrand(ev.brand || '');
    setEditingStart(ev.eventStart || '');
    setEditingEnd(ev.eventEnd || '');
    setEditingTicketKind(ev.ticketKind || '');
    setEditingDeadline(ev.deadline || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingTitle('');
    setEditingUrl('');
    setEditingMemo('');
    setEditingBrand('');
    setEditingStart('');
    setEditingEnd('');
    setEditingTicketKind('');
    setEditingDeadline('');
  };

  const saveEdit = async (eventId) => {
    if (!editingTitle.trim()) return;
    if (editingStart && editingEnd && editingStart > editingEnd) {
      showToast('開始日は終了日より前にしてください', 'error');
      return;
    }
    try {
      await updateDoc(doc(db, 'events', eventId), {
        title: editingTitle.trim(),
        type: editingType,
        url: editingUrl.trim(),
        memo: editingMemo,
        brand: editingBrand,
        eventStart: editingStart,
        eventEnd: editingEnd,
        ticketKind: editingTicketKind,
        deadline: editingDeadline,
      });
      cancelEdit();
      showToast('予定を更新しました', 'success');
    } catch (error) {
      console.error('編集失敗:', error);
      showToast('更新に失敗しました', 'error');
    }
  };

  const handleRemoveMember = async (targetUserId) => {
    try {
      await deleteDoc(doc(db, 'members', targetUserId));
      showToast('メンバーを削除しました', 'success');
    } catch (e) {
      console.error('メンバー削除失敗', e);
      showToast('削除に失敗しました', 'error');
    }
  };

  const tileContent = ({ date, view }) => {
    if (view === 'month') {
      const dateStr = formatDateStr(date);
      const dayEvents = events[dateStr];
      if (dayEvents && dayEvents.length > 0) {
        const visible = dayEvents.slice(0, 2);
        const overflow = dayEvents.length - 2;
        return (
          <div className="event-badges-container">
            {visible.map((ev) => {
              const datePrefix = ev.eventStart
                ? (() => { const [,m,d] = ev.eventStart.split('-'); return `${Number(m)}/${Number(d)} `; })()
                : '';
              return (
                <div key={ev.id} className={`event-badge ${ev.type}`}>
                  {datePrefix && <span className="badge-date">{datePrefix}</span>}{ev.title}
                </div>
              );
            })}
            {overflow > 0 && (
              <div className="event-badge-overflow">+{overflow}件</div>
            )}
          </div>
        );
      }
    }
    return null;
  };

  const selectedDateStr = selectedDate ? formatDateStr(selectedDate) : '';
  const selectedDayEvents = selectedDate ? events[selectedDateStr] || [] : [];

  const formatDeadline = (dt) => {
    if (!dt) return '';
    const [date, time] = dt.split('T');
    const [y, m, d] = date.split('-');
    return `${y}/${m}/${d} ${time ? time.slice(0, 5) : ''}`;
  };

  const BRANDS = ['765AS', 'シンデレラ', 'ミリオン', 'SideM', 'シャイニー', '学マス', 'valiv', 'その他'];

  const typeEmoji = (type) => {
    if (type === 'drink')  return '🍻';
    if (type === 'game')   return '🎮';
    if (type === 'live')   return '🎤';
    if (type === 'ticket') return '🎫';
    return '📅';
  };

  return (
    <div className="calendar-app">
      <div className="user-selector">
        <span>👤 LINEログイン中: <strong>{currentUser || '読み込み中...'}</strong></span>
        <button className="help-btn" onClick={() => setShowHelp(true)}>！</button>
      </div>

      <header className="header">
        <div className="imas-rainbow-bar" />
        <div className="header-inner">
          <h1>グループ予定表</h1>
          <div className="brand-dots">
            <span className="d-765" />
            <span className="d-cg" />
            <span className="d-ml" />
            <span className="d-sidem" />
            <span className="d-shiny" />
            <span className="d-gaku" />
          </div>
        </div>
      </header>

      <div className="calendar-container">
        <Calendar
          onClickDay={(value) => setSelectedDate(value)}
          tileContent={tileContent}
          calendarType="gregory"
          formatDay={(locale, date) => date.getDate()}
        />
        <div className="notify-info">
          🔔 前日20時と当日8時にLINE通知が届きます
        </div>
      </div>

      {selectedDate && (
        <div className="modal-overlay" onClick={() => setSelectedDate(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedDate.getMonth() + 1}月{selectedDate.getDate()}日の予定</h2>
            </div>

            <div className="modal-body">
              <div className="day-events-list">
                {selectedDayEvents.length > 0 ? (
                  selectedDayEvents.map(ev => {
                    const responses = ev.responses || {};
                    // キーがuserIdなら表示名に変換、旧データ（displayName直接格納）はそのまま表示
                    const resolveKey = (key) => membersMap[key] || key;
                    const attendees = Object.keys(responses)
                      .filter(k => responses[k] === 'attend')
                      .map(resolveKey);
                    const absentees = Object.keys(responses)
                      .filter(k => responses[k] === 'absent')
                      .map(resolveKey);
                    // 新形式（userId）・旧形式（displayName）の両方を確認
                    const myResponse = responses[userId] ?? responses[currentUser];
                    const isEditing = editingId === ev.id;

                    return (
                      <div key={ev.id} className={`event-detail-card type-${ev.type}`}>
                        {isEditing ? (
                          <div className="edit-mode">
                            <input
                              className="event-input"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              autoFocus
                            />
                            <select className="event-select brand-select" value={editingType} onChange={(e) => setEditingType(e.target.value)}>
                              <option value="event">📅 イベント</option>
                              <option value="drink">🍻 飲み会</option>
                              <option value="game">🎮 ゲーム</option>
                              <option value="live">🎤 ライブ</option>
                              <option value="ticket">🎫 チケット応募</option>
                            </select>
                            <select className="event-select brand-select" value={editingBrand} onChange={(e) => setEditingBrand(e.target.value)}>
                              <option value="">ブランド（任意）</option>
                              {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                            <input
                              type="url"
                              className="event-input"
                              value={editingUrl}
                              onChange={(e) => setEditingUrl(e.target.value)}
                              placeholder="URL（任意）"
                            />
                            <textarea
                              className="event-input event-memo"
                              value={editingMemo}
                              onChange={(e) => setEditingMemo(e.target.value)}
                              placeholder="メモ（任意）"
                              rows={3}
                            />
                            <div className="date-range-row">
                              <input type="date" className="event-input date-input" value={editingStart} max={editingEnd || undefined} onChange={(e) => setEditingStart(e.target.value)} />
                              <span className="date-sep">〜</span>
                              <input type="date" className="event-input date-input" value={editingEnd} min={editingStart || undefined} onChange={(e) => setEditingEnd(e.target.value)} />
                            </div>
                            {editingType === 'ticket' && (
                              <>
                                <input type="text" className="event-input" placeholder="チケット種類（プレ会・一般先着 など）" value={editingTicketKind} onChange={(e) => setEditingTicketKind(e.target.value)} />
                                <div className="deadline-row">
                                  <span className="field-label">⏰ 締切</span>
                                  <input type="datetime-local" className="event-input deadline-input" value={editingDeadline} onChange={(e) => setEditingDeadline(e.target.value)} />
                                </div>
                              </>
                            )}
                            <div className="form-row">
                              <button className="add-btn" onClick={() => saveEdit(ev.id)}>保存</button>
                              <button className="cancel-btn" onClick={cancelEdit}>キャンセル</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="event-card-header">
                              <span className={`event-badge ${ev.type}`}>{typeEmoji(ev.type)}</span>
                              <span className="event-title">{ev.title}</span>
                              <button
                                className="edit-btn"
                                onClick={() => startEdit(ev)}
                                title="予定を編集"
                              >✏️</button>
                              <button
                                className="delete-btn"
                                onClick={() => setConfirmDelete(ev)}
                                title="予定を削除"
                              >🗑️</button>
                            </div>
                            <div className="creator-row">
                              <p className="creator-text">作成者: {ev.createdBy}</p>
                              {ev.brand && <span className="brand-tag">{ev.brand}</span>}
                            </div>

                            {(ev.eventStart || ev.eventEnd) && (
                              <p className="event-dates-text">
                                📆 {ev.eventStart ? ev.eventStart.replace(/-/g, '/') : '?'}
                                {ev.eventEnd && ev.eventEnd !== ev.eventStart ? ` 〜 ${ev.eventEnd.replace(/-/g, '/')}` : ''}
                              </p>
                            )}
                            {ev.ticketKind && (
                              <p className="event-ticket-kind">🎫 {ev.ticketKind}</p>
                            )}
                            {ev.deadline && (
                              <p className="event-deadline">⏰ 締切: {formatDeadline(ev.deadline)}</p>
                            )}

                            {ev.url && (
                              <p className="event-url-text">
                                <a href={ev.url} target="_blank" rel="noopener noreferrer">{ev.url}</a>
                              </p>
                            )}
                            {ev.memo && (
                              <p className="event-memo-text">
                                {ev.memo.split('\n').map((line, i, arr) => (
                                  <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
                                ))}
                              </p>
                            )}

                            <div className="response-buttons">
                              <button
                                className={`btn-attend ${myResponse === 'attend' ? 'active' : ''}`}
                                onClick={() => handleResponse(ev, 'attend')}
                              >⭕️ 参加</button>
                              <button
                                className={`btn-absent ${myResponse === 'absent' ? 'active' : ''}`}
                                onClick={() => handleResponse(ev, 'absent')}
                              >❌ 不参加</button>
                            </div>

                            <div className="response-summary">
                              <div className="summary-row attend-row">
                                <span className="label">参加:</span>
                                <span className="members">{attendees.join(', ') || '-'}</span>
                              </div>
                              <div className="summary-row absent-row">
                                <span className="label">不参加:</span>
                                <span className="members">{absentees.join(', ') || '-'}</span>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p>予定はありません</p>
                )}
              </div>

              <div className="add-event-form">
                <h3>予定を追加</h3>
                <input
                  type="text"
                  placeholder="予定のタイトル"
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="event-input"
                />
                <select className="event-select brand-select" value={newEventType} onChange={(e) => setNewEventType(e.target.value)}>
                  <option value="event">📅 イベント</option>
                  <option value="drink">🍻 飲み会</option>
                  <option value="game">🎮 ゲーム</option>
                  <option value="live">🎤 ライブ</option>
                  <option value="ticket">🎫 チケット応募</option>
                </select>
                <select className="event-select brand-select" value={newEventBrand} onChange={(e) => setNewEventBrand(e.target.value)}>
                  <option value="">ブランド（任意）</option>
                  {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <input
                  type="url"
                  placeholder="URL（任意）"
                  value={newEventUrl}
                  onChange={(e) => setNewEventUrl(e.target.value)}
                  className="event-input"
                />
                <textarea
                  placeholder="メモ（任意）"
                  value={newEventMemo}
                  onChange={(e) => setNewEventMemo(e.target.value)}
                  className="event-input event-memo"
                  rows={3}
                />
                <div className="date-range-row">
                  <input type="date" className="event-input date-input" value={newEventStart} max={newEventEnd || undefined} onChange={(e) => setNewEventStart(e.target.value)} />
                  <span className="date-sep">〜</span>
                  <input type="date" className="event-input date-input" value={newEventEnd} min={newEventStart || undefined} onChange={(e) => setNewEventEnd(e.target.value)} />
                </div>
                {newEventType === 'ticket' && (
                  <>
                    <input type="text" className="event-input" placeholder="チケット種類（プレ会・一般先着 など）" value={newEventTicketKind} onChange={(e) => setNewEventTicketKind(e.target.value)} />
                    <div className="deadline-row">
                      <span className="field-label">⏰ 締切</span>
                      <input type="datetime-local" className="event-input deadline-input" value={newEventDeadline} onChange={(e) => setNewEventDeadline(e.target.value)} />
                    </div>
                  </>
                )}
                <div className="form-row">
                  <button
                    onClick={handleAddEvent}
                    className={`add-btn ${canAddEvent ? '' : 'disabled'}`}
                    disabled={!canAddEvent}
                  >追加</button>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="close-btn" onClick={() => setSelectedDate(null)}>閉じる</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay confirm-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-message">
              「{confirmDelete.title}」を削除しますか？
            </p>
            <div className="confirm-buttons">
              <button className="cancel-btn" onClick={() => setConfirmDelete(null)}>キャンセル</button>
              <button className="delete-confirm-btn" onClick={() => handleDeleteEvent(confirmDelete.id)}>削除</button>
            </div>
          </div>
        </div>
      )}

      {showHelp && (
        <div className="modal-overlay confirm-overlay" onClick={() => { setShowHelp(false); setShowMembers(false); }}>
          <div className="help-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="help-header">
              <span className="help-title">{showMembers ? 'メンバー管理' : '機能一覧'}</span>
              <div className="help-header-actions">
                <button
                  className="help-tab-btn"
                  onClick={() => setShowMembers((v) => !v)}
                  title={showMembers ? '機能一覧へ' : 'メンバー管理'}
                >
                  {showMembers ? '📋 機能一覧' : '👥 メンバー'}
                </button>
                <button className="help-close" onClick={() => { setShowHelp(false); setShowMembers(false); }}>✕</button>
              </div>
            </div>

            {showMembers ? (
              <div className="members-manage-list">
                <p className="members-manage-note">
                  グループを退出したメンバーは通知が届き続けます。<br />
                  退出済みのメンバーを削除してください。
                </p>
                <ul className="help-list">
                  {Object.entries(membersMap).map(([uid, name]) => (
                    <li key={uid} className="member-manage-row">
                      <span className="help-icon">👤</span>
                      <div className="member-manage-info">
                        <strong>{name}</strong>
                        {uid === userId && <span className="member-self-tag">（自分）</span>}
                      </div>
                      <button
                        className="member-remove-btn"
                        onClick={() => handleRemoveMember(uid)}
                        title="このメンバーを通知リストから削除"
                      >削除</button>
                    </li>
                  ))}
                  {Object.keys(membersMap).length === 0 && (
                    <li className="member-manage-row"><span style={{ color: '#999' }}>メンバーなし</span></li>
                  )}
                </ul>
              </div>
            ) : (
              <ul className="help-list">
                <li><span className="help-icon">📅</span><div><strong>予定の確認・追加</strong><br />日付をタップしてその日の予定を確認・追加できます</div></li>
                <li><span className="help-icon">🔗</span><div><strong>URL・メモ</strong><br />予定にURLやメモ（改行可）を添付できます</div></li>
                <li><span className="help-icon">⭕️❌</span><div><strong>出欠返答</strong><br />各予定に参加 / 不参加を回答できます</div></li>
                <li><span className="help-icon">🔔</span><div><strong>LINE通知</strong><br />前日20時・当日8時に通知が届きます<br />予定追加・出欠変更時もリアルタイム通知</div></li>
                <li><span className="help-icon">✏️🗑️</span><div><strong>編集・削除</strong><br />予定はいつでも編集・削除できます</div></li>
                <li>
                  <span className="help-icon">🏷️</span>
                  <div>
                    <strong>カテゴリ</strong><br />
                    <span className="help-types">
                      <span>📅 イベント</span>
                      <span>🍻 飲み会</span>
                      <span>🎮 ゲーム</span>
                      <span>🎤 ライブ</span>
                      <span>🎫 チケット応募</span>
                    </span>
                  </div>
                </li>
                <li>
                  <span className="help-icon">👥</span>
                  <div><strong>メンバー管理</strong><br />「👥 メンバー」ボタンから退出者を通知リストから削除できます</div>
                </li>
              </ul>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.message}</div>
      )}
    </div>
  );
}

export default App;
