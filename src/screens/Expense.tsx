import { useEffect, useState } from 'react';
import { useStore } from '../data/store';
import { category } from '../lib/categories';
import { longDate, REPEAT_LABELS, timeAgo } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { goBack, navigate } from '../lib/router';
import { Avatar, CategoryTile, Empty, IconButton, Link, Page } from '../ui/components';

export function ExpenseDetail({ id }: { id: string }) {
  const s = useStore();
  const e = s.data.expenses[id];
  const [receipt, setReceipt] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [comment, setComment] = useState('');

  useEffect(() => {
    let alive = true;
    if (e?.hasReceipt) s.backend.getReceipt(e.groupId, id).then((r) => alive && setReceipt(r));
    else setReceipt(null);
    return () => {
      alive = false;
    };
  }, [id, e?.groupId, e?.hasReceipt, e?.updatedAt, s.backend]);

  if (!e) {
    return (
      <Page title="Expense" back="groups">
        <Empty title="Expense not found" />
      </Page>
    );
  }

  const group = s.data.groups[e.groupId];
  const people = [...new Set([...Object.keys(e.paidBy), ...Object.keys(e.owed)])];
  const money = (v: number) => formatMoney(v, e.currency);
  const comments = Object.values(s.data.comments)
    .filter((c) => c.expenseId === id && !c.deleted)
    .sort((a, b) => a.createdAt - b.createdAt);
  const fallback = `group/${e.groupId}`;

  const remove = () => {
    if (!confirm(`Delete “${e.isPayment ? 'this payment' : e.description}”? You can restore it later from this page.`)) return;
    s.deleteExpense(id);
    goBack(fallback);
  };
  const post = () => {
    if (!comment.trim()) return;
    s.addComment(id, comment.trim());
    setComment('');
  };

  return (
    <Page
      title={e.isPayment ? 'Payment' : 'Expense'}
      back={fallback}
      right={
        !e.deleted && (
          <>
            <IconButton icon="trash" label="Delete" onClick={remove} />
            <IconButton icon="edit" label="Edit" to={e.isPayment ? `settle?edit=${id}` : `edit/${id}`} />
          </>
        )
      }
    >
      {e.deleted && (
        <div className="banner">
          This {e.isPayment ? 'payment' : 'expense'} was deleted.
          <button className="btn small" onClick={() => s.restoreExpense(id)}>
            Restore
          </button>
        </div>
      )}
      <div className="expense-head">
        {e.isPayment ? <span className="tile pay-tile big">💵</span> : <CategoryTile id={e.category} size={64} />}
        <div>
          <h2>{e.isPayment ? 'Payment' : e.description}</h2>
          <div className="amount-big">{money(e.amount)}</div>
          <div className="tiny muted">
            {longDate(e.date)} · Added by {s.name(e.createdBy, true)} {timeAgo(e.createdAt)}
          </div>
          {e.updatedBy && e.updatedAt - e.createdAt > 2000 && (
            <div className="tiny muted">
              Last updated by {s.name(e.updatedBy, true)} {timeAgo(e.updatedAt)}
            </div>
          )}
          {group && (
            <div className="tiny">
              in <Link to={`group/${group.id}`}>{group.name}</Link>
            </div>
          )}
          {!e.isPayment && <div className="tiny muted">{category(e.category).name}</div>}
        </div>
      </div>

      <div className="list split-list">
        {people.map((p) => {
          const paid = e.paidBy[p] ?? 0;
          const owed = e.owed[p] ?? 0;
          const verb = p === s.meId ? '' : 's';
          return (
            <div key={p} className="row">
              <Avatar id={p} size={36} />
              <div className="main">
                <b>{s.name(p)}</b>{' '}
                {e.isPayment ? (
                  paid ? (
                    <>
                      paid <b>{money(paid)}</b>
                    </>
                  ) : (
                    <>
                      received <b>{money(owed)}</b>
                    </>
                  )
                ) : (
                  <>
                    {paid > 0 && (
                      <>
                        paid <b>{money(paid)}</b>
                        {owed > 0 && ' and '}
                      </>
                    )}
                    {owed > 0 && (
                      <>
                        owe{verb} <b>{money(owed)}</b>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {e.items && e.items.length > 0 && (
        <section className="card">
          <h3>Items</h3>
          {e.items.map((it) => (
            <div key={it.id} className="item-line">
              <span>
                {it.name} <small className="muted">({it.personIds.map((p) => s.name(p)).join(', ')})</small>
              </span>
              <b>{money(it.amount)}</b>
            </div>
          ))}
          {!!e.tax && (
            <div className="item-line muted">
              <span>Tax</span>
              <span>{money(e.tax)}</span>
            </div>
          )}
          {!!e.tip && (
            <div className="item-line muted">
              <span>Tip / service</span>
              <span>{money(e.tip)}</span>
            </div>
          )}
        </section>
      )}

      {(e.notes || (e.repeat && e.repeat !== 'never') || e.recurringOf) && (
        <section className="card">
          {e.notes && <p className="notes">{e.notes}</p>}
          {e.repeat && e.repeat !== 'never' && <p className="tiny muted">🔁 {REPEAT_LABELS[e.repeat]}</p>}
          {e.recurringOf && (
            <p className="tiny muted">
              🔁 Created automatically from a <Link to={`expense/${e.recurringOf}`}>repeating expense</Link>
            </p>
          )}
        </section>
      )}

      {e.hasReceipt && (
        <section className="card">
          <h3>Receipt</h3>
          {receipt ? (
            <img className="receipt" src={receipt} alt="Receipt" onClick={() => setZoom(true)} />
          ) : (
            <p className="muted tiny">The receipt image will appear once it has synced to this device.</p>
          )}
        </section>
      )}

      <section className="card">
        <h3>Comments</h3>
        {comments.length === 0 && <p className="muted tiny">No comments yet.</p>}
        {comments.map((c) => (
          <div key={c.id} className="comment">
            <Avatar id={c.personId} size={28} />
            <div className="main">
              <div className="tiny">
                <b>{s.name(c.personId)}</b> <span className="muted">{timeAgo(c.createdAt)}</span>
                {c.personId === s.meId && (
                  <button className="link tiny" onClick={() => s.deleteComment(c.id)}>
                    delete
                  </button>
                )}
              </div>
              <div>{c.text}</div>
            </div>
          </div>
        ))}
        <div className="comment-box">
          <input value={comment} onChange={(ev) => setComment(ev.target.value)} placeholder="Add a comment" onKeyDown={(ev) => ev.key === 'Enter' && post()} />
          <button className="btn small" onClick={post} disabled={!comment.trim()}>
            Post
          </button>
        </div>
      </section>

      {zoom && receipt && (
        <div className="lightbox" onClick={() => setZoom(false)}>
          <img src={receipt} alt="Receipt" />
        </div>
      )}
      {!e.deleted && !e.isPayment && (
        <div className="center pad">
          <button className="btn outline" onClick={() => navigate(`add?copy=${id}`)}>
            Duplicate expense
          </button>
        </div>
      )}
    </Page>
  );
}
