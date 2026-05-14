import { useState, useEffect } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import './App.css';
import { db } from './firebase'; 
import { collection, addDoc, onSnapshot, query, doc, updateDoc, deleteDoc } from 'firebase/firestore';
// LINEのライブラリをインポート
import liff from '@line/liff';

function App() {
  // LINEから取得するユーザー情報のステート
  const [currentUser, setCurrentUser] = useState(null);
  
  const [selectedDate, setSelectedDate] = useState(null);
  const [events, setEvents] = useState({});
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventType, setNewEventType] = useState('event');

  const eventsCollectionRef = collection(db, 'events');

  // --------------------------------------------------
  // 1. LIFFの初期化（LINEログイン）
  // --------------------------------------------------
  useEffect(() => {
    liff.init({ liffId: "2010083936-tdIXgoSL" }) // ★ここにIDを貼り付け！
      .then(() => {
        if (!liff.isLoggedIn()) {
          liff.login(); // ログインしていなければログイン画面へ
        } else {
          liff.getProfile().then(profile => {
            // LINEの名前をセット
            setCurrentUser(profile.displayName);
          });
        }
      })
      .catch((err) => {
        console.error("LIFF初期化失敗", err);
      });
  }, []);

  // 予定の読み込み（変更なし）
  useEffect(() => {
    const q = query(eventsCollectionRef);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedEvents = {};
      snapshot.forEach((doc) => {
        const data = doc.data();
        const dateStr = data.dateStr;
        if (!fetchedEvents[dateStr]) fetchedEvents[dateStr] = [];
        fetchedEvents[dateStr].push({ id: doc.id, ...data });
      });
      setEvents(fetchedEvents);
    });
    return () => unsubscribe();
  }, []);

  const formatDateStr = (date) => {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  };

  const handleAddEvent = async () => {
    if (newEventTitle.trim() === '' || !currentUser) return;
    const dateKey = formatDateStr(selectedDate);
    
    const newEventData = {
      type: newEventType,
      title: newEventTitle,
      dateStr: dateKey,
      createdBy: currentUser,
      responses: { [currentUser]: 'attend' },
      createdAt: new Date()
    };

    try {
      await addDoc(eventsCollectionRef, newEventData);
      setNewEventTitle('');
    } catch (error) {
      console.error("保存失敗:", error);
    }
  };

  const handleResponse = async (eventId, status) => {
    if (!currentUser) return;
    try {
      const eventRef = doc(db, 'events', eventId);
      await updateDoc(eventRef, {
        [`responses.${currentUser}`]: status
      });
    } catch (error) {
      console.error("更新失敗:", error);
    }
  };

  const handleDeleteEvent = async (eventId, eventTitle) => {
    if (!window.confirm(`「${eventTitle}」を削除しますか？`)) return;
    try {
      await deleteDoc(doc(db, 'events', eventId));
    } catch (error) {
      console.error("削除失敗:", error);
    }
  };

  // カレンダーの表示（変更なし）
  const tileContent = ({ date, view }) => {
    if (view === 'month') {
      const dateStr = formatDateStr(date);
      const dayEvents = events[dateStr];
      if (dayEvents && dayEvents.length > 0) {
        return (
          <div className="event-badges-container">
            {dayEvents.map((ev) => (
              <div key={ev.id} className={`event-badge ${ev.type}`}>{ev.title}</div>
            ))}
          </div>
        );
      }
    }
    return null;
  };

  const selectedDateStr = selectedDate ? formatDateStr(selectedDate) : '';
  const selectedDayEvents = selectedDate ? events[selectedDateStr] || [] : [];

  return (
    <div className="calendar-app">
      {/* ログインしているLINEユーザーを表示 */}
      <div className="user-selector">
        <span>👤 LINEログイン中: <strong>{currentUser || '読み込み中...'}</strong></span>
      </div>

      <div className="imas-rainbow-bar" />
      <header className="header">
        <h1>グループ予定表</h1>
        <div className="brand-dots">
          <span className="d-765" />
          <span className="d-cg" />
          <span className="d-ml" />
          <span className="d-sidem" />
          <span className="d-shiny" />
          <span className="d-gaku" />
        </div>
      </header>
      
      <div className="calendar-container">
        <Calendar 
          onClickDay={(value) => setSelectedDate(value)}
          tileContent={tileContent}
          calendarType="gregory"
          formatDay={(locale, date) => date.getDate()}
        />
      </div>

      {selectedDate && (
        <div className="modal-overlay" onClick={() => setSelectedDate(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{selectedDate.getMonth() + 1}月{selectedDate.getDate()}日の予定</h2>
            
            <div className="modal-body">
              <div className="day-events-list">
                {selectedDayEvents.length > 0 ? (
                  selectedDayEvents.map(ev => {
                    const responses = ev.responses || {};
                    const attendees = Object.keys(responses).filter(m => responses[m] === 'attend');
                    const absentees = Object.keys(responses).filter(m => responses[m] === 'absent');
                    const myResponse = responses[currentUser];

                    return (
                      <div key={ev.id} className={`event-detail-card type-${ev.type}`}>
                        <div className="event-card-header">
                          <span className={`event-badge ${ev.type}`}>
                            {ev.type === 'drink' ? '🍻' : ev.type === 'game' ? '🎮' : '📅'}
                          </span>
                          <span className="event-title">{ev.title}</span>
                          <button
                            className="delete-btn"
                            onClick={() => handleDeleteEvent(ev.id, ev.title)}
                            title="予定を削除"
                          >🗑️</button>
                        </div>
                        <p className="creator-text">作成者: {ev.createdBy}</p>

                        <div className="response-buttons">
                          <button 
                            className={`btn-attend ${myResponse === 'attend' ? 'active' : ''}`}
                            onClick={() => handleResponse(ev.id, 'attend')}
                          >⭕️ 参加</button>
                          <button 
                            className={`btn-absent ${myResponse === 'absent' ? 'active' : ''}`}
                            onClick={() => handleResponse(ev.id, 'absent')}
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
                  className="event-input"
                />
                <div className="form-row">
                  <select value={newEventType} onChange={(e) => setNewEventType(e.target.value)} className="event-select">
                    <option value="event">📅 イベント</option>
                    <option value="drink">🍻 飲み会</option>
                    <option value="game">🎮 ゲーム</option>
                  </select>
                  <button onClick={handleAddEvent} className="add-btn">追加</button>
                </div>
              </div>
            </div>
            <button className="close-btn" onClick={() => setSelectedDate(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
