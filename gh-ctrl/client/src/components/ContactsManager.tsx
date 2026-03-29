import { useState, useEffect } from 'react'
import { useAppStore } from '../store'
import type { Contact } from '../types'

export function ContactsManager() {
  const contacts = useAppStore((s) => s.contacts)
  const loadContacts = useAppStore((s) => s.loadContacts)
  const createContact = useAppStore((s) => s.createContact)
  const updateContact = useAppStore((s) => s.updateContact)
  const deleteContact = useAppStore((s) => s.deleteContact)
  const addToast = useAppStore((s) => s.addToast)

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [notes, setNotes] = useState('')
  const [adding, setAdding] = useState(false)
  const [formError, setFormError] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editFields, setEditFields] = useState<{ username: string; email: string; displayName: string; notes: string }>({ username: '', email: '', displayName: '', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadContacts()
  }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!username.trim()) { setFormError('Username is required'); return }
    if (!email.trim()) { setFormError('Email is required'); return }

    setAdding(true)
    try {
      await createContact({
        username: username.trim(),
        email: email.trim(),
        displayName: displayName.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      addToast(`Contact ${username} added`, 'success')
      setUsername('')
      setEmail('')
      setDisplayName('')
      setNotes('')
    } catch {
      // toast already shown by store
    } finally {
      setAdding(false)
    }
  }

  const startEdit = (contact: Contact) => {
    setEditId(contact.id)
    setEditFields({
      username: contact.username,
      email: contact.email,
      displayName: contact.displayName ?? '',
      notes: contact.notes ?? '',
    })
  }

  const handleSaveEdit = async (id: number) => {
    if (!editFields.username.trim() || !editFields.email.trim()) return
    setSaving(true)
    try {
      await updateContact(id, {
        username: editFields.username.trim(),
        email: editFields.email.trim(),
        displayName: editFields.displayName.trim() || undefined,
        notes: editFields.notes.trim() || undefined,
      })
      addToast('Contact updated', 'success')
      setEditId(null)
    } catch {
      // toast already shown by store
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number, uname: string) => {
    try {
      await deleteContact(id)
      addToast(`Removed ${uname}`, 'info')
    } catch {
      // toast already shown by store
    }
  }

  return (
    <div className="settings-page">
      <div className="topbar">
        <h1>Contacts</h1>
      </div>

      <div className="settings-section">
        <h2>Add Contact</h2>
        <p style={{ color: 'var(--text-2)', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
          Map a GitHub/GitLab username to an email address. When you click a user on the Battlefield, this email will be used instead of the guessed address.
        </p>
        <form onSubmit={handleAdd}>
          <div className="form-row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              className="input"
              type="text"
              placeholder="Username (e.g. octocat)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ flex: '1 1 140px' }}
            />
            <input
              className="input"
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ flex: '2 1 200px' }}
            />
          </div>
          <div className="form-row" style={{ gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            <input
              className="input"
              type="text"
              placeholder="Display name (optional)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={{ flex: '1 1 160px' }}
            />
            <input
              className="input"
              type="text"
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ flex: '2 1 200px' }}
            />
            <button className="btn btn-primary" type="submit" disabled={adding} style={{ whiteSpace: 'nowrap' }}>
              {adding ? 'Adding...' : '+ Add'}
            </button>
          </div>
          {formError && <div className="form-error">{formError}</div>}
        </form>
      </div>

      <div className="settings-section">
        <h2>Contacts ({contacts.length})</h2>
        {contacts.length === 0 ? (
          <div className="empty-state">
            <p>No contacts yet. Add a username → email mapping above.</p>
          </div>
        ) : (
          <div className="repo-list-settings">
            {contacts.map((contact) => (
              <div key={contact.id} className="repo-list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.4rem' }}>
                {editId === contact.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <input
                        className="input"
                        type="text"
                        value={editFields.username}
                        onChange={(e) => setEditFields((f) => ({ ...f, username: e.target.value }))}
                        placeholder="Username"
                        style={{ flex: '1 1 120px' }}
                      />
                      <input
                        className="input"
                        type="email"
                        value={editFields.email}
                        onChange={(e) => setEditFields((f) => ({ ...f, email: e.target.value }))}
                        placeholder="Email"
                        style={{ flex: '2 1 180px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <input
                        className="input"
                        type="text"
                        value={editFields.displayName}
                        onChange={(e) => setEditFields((f) => ({ ...f, displayName: e.target.value }))}
                        placeholder="Display name"
                        style={{ flex: '1 1 140px' }}
                      />
                      <input
                        className="input"
                        type="text"
                        value={editFields.notes}
                        onChange={(e) => setEditFields((f) => ({ ...f, notes: e.target.value }))}
                        placeholder="Notes"
                        style={{ flex: '2 1 180px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => handleSaveEdit(contact.id)} disabled={saving}>
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--green-neon, #00ff88)' }}>
                          @{contact.username}
                        </span>
                        {contact.displayName && (
                          <span style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>
                            ({contact.displayName})
                          </span>
                        )}
                      </div>
                      <div style={{ color: 'var(--text-2)', fontSize: '0.82rem', marginTop: '2px' }}>
                        {contact.email}
                        {contact.notes && (
                          <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>— {contact.notes}</span>
                        )}
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(contact)}>
                      Edit
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(contact.id, contact.username)}>
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
