'use client';

import { useState, useEffect } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api';

interface Rink {
  id: string;
  venue_id: string;
  name: string;
  address: string | null;
  locker_rooms?: any[];
}

interface Venue {
  id: string;
  name: string;
  city: string;
  state: string;
  address: string | null;
  num_rinks: number;
  rinks?: Rink[];
}

interface LockerRoom {
  id: string;
  rink_id: string;
  name: string;
  sort_order: number;
}

function VenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedVenue, setExpandedVenue] = useState<string | null>(null);
  const [expandedRink, setExpandedRink] = useState<string | null>(null);
  const [addingLockerRoom, setAddingLockerRoom] = useState<string | null>(null);
  const [newLockerRoomName, setNewLockerRoomName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingLockerRoom, setDeletingLockerRoom] = useState<string | null>(null);

  // Load venues
  useEffect(() => {
    loadVenues();
  }, []);

  const loadVenues = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/venues`, {
        headers: { 'X-Dev-Bypass': 'true' }
      });
      const json = await res.json();
      if (json.success) {
        setVenues(json.data);
      }
    } catch (e) {
      console.error('Failed to load venues', e);
    }
    setLoading(false);
  };

  const loadRinks = async (venueId: string) => {
    try {
      const res = await fetch(`${API_BASE}/venues/${venueId}/rinks`, {
        headers: { 'X-Dev-Bypass': 'true' }
      });
      const json = await res.json();
      if (json.success) {
        setVenues(prev => prev.map(v => v.id === venueId ? { ...v, rinks: json.data } : v));
      }
    } catch (e) {
      console.error('Failed to load rinks', e);
    }
  };

  const loadLockerRooms = async (rinkId: string) => {
    try {
      const res = await fetch(`${API_BASE}/director/rinks/${rinkId}/locker-rooms`, {
        headers: { 'X-Dev-Bypass': 'true' }
      });
      const json = await res.json();
      if (json.success) {
        setVenues(prev => prev.map(v => ({
          ...v,
          rinks: v.rinks?.map(r => r.id === rinkId ? { ...r, locker_rooms: json.data } : r)
        })));
      }
    } catch (e) {
      console.error('Failed to load locker rooms', e);
    }
  };

  const handleExpandVenue = async (venueId: string) => {
    if (expandedVenue === venueId) {
      setExpandedVenue(null);
    } else {
      setExpandedVenue(venueId);
      await loadRinks(venueId);
    }
  };

  const handleExpandRink = async (rinkId: string) => {
    if (expandedRink === rinkId) {
      setExpandedRink(null);
    } else {
      setExpandedRink(rinkId);
      await loadLockerRooms(rinkId);
    }
  };

  const handleAddLockerRoom = async (rinkId: string) => {
    if (!newLockerRoomName.trim()) return;
    setSaving(true);
    try {
      const rink = venues
        .flatMap(v => v.rinks || [])
        .find(r => r.id === rinkId);
      const lockerRoomCount = (rink?.locker_rooms?.length || 0);

      const res = await fetch(`${API_BASE}/director/rinks/${rinkId}/locker-rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Dev-Bypass': 'true'
        },
        body: JSON.stringify({
          name: newLockerRoomName,
          sortOrder: lockerRoomCount
        })
      });
      const json = await res.json();
      if (json.success) {
        setNewLockerRoomName('');
        setAddingLockerRoom(null);
        await loadLockerRooms(rinkId);
      }
    } catch (e) {
      console.error('Failed to add locker room', e);
    }
    setSaving(false);
  };

  const handleDeleteLockerRoom = async (lockerRoomId: string, rinkId: string) => {
    setDeletingLockerRoom(lockerRoomId);
    try {
      const res = await fetch(`${API_BASE}/director/locker-rooms/${lockerRoomId}`, {
        method: 'DELETE',
        headers: { 'X-Dev-Bypass': 'true' }
      });
      const json = await res.json();
      if (json.success) {
        await loadLockerRooms(rinkId);
      }
    } catch (e) {
      console.error('Failed to delete locker room', e);
    }
    setDeletingLockerRoom(null);
  };

  const inputCls = "w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 focus:border-cyan-500 outline-none";
  const labelCls = "block text-sm font-medium text-[#3d3d3d] mb-1";

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#003e79]" />
      </div>
    );
  }

  return (
    <div className="bg-[#fafafa] min-h-[calc(100vh-3.5rem)]">
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1d1d1f] mb-1">Venues & Rinks</h1>
          <p className="text-sm text-[#6e6e73]">Manage venues, rinks, and locker rooms</p>
        </div>

        {/* Venues List */}
        <div className="space-y-3">
          {venues.length > 0 ? (
            venues.map(venue => (
              <div key={venue.id}>
                {/* Venue Card */}
                <div
                  onClick={() => handleExpandVenue(venue.id)}
                  className="bg-white border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] rounded-xl p-4 cursor-pointer hover:shadow-md transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h2 className="font-semibold text-[#1d1d1f]">{venue.name}</h2>
                      <p className="text-xs text-[#86868b] mt-0.5">{venue.city}, {venue.state}</p>
                      {venue.address && <p className="text-xs text-[#6e6e73] mt-0.5">{venue.address}</p>}
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <span className="text-sm font-semibold text-[#003e79]">{venue.num_rinks} rink{venue.num_rinks !== 1 ? 's' : ''}</span>
                      <svg
                        className={`w-5 h-5 text-[#86868b] transition-transform ${expandedVenue === venue.id ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Expanded Venue Content */}
                {expandedVenue === venue.id && (
                  <div className="mt-2 ml-2 space-y-2 border-l-2 border-[#e8e8ed] pl-3">
                    {venue.rinks && venue.rinks.length > 0 ? (
                      venue.rinks.map(rink => (
                        <div key={rink.id}>
                          {/* Rink Card */}
                          <div
                            onClick={() => handleExpandRink(rink.id)}
                            className="bg-white border border-[#e8e8ed] rounded-lg p-3 cursor-pointer hover:bg-[#f5f5f7] transition"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <p className="font-medium text-[#3d3d3d] text-sm">{rink.name}</p>
                                {rink.address && <p className="text-xs text-[#86868b] mt-1">{rink.address}</p>}
                              </div>
                              <svg
                                className={`w-4 h-4 text-[#86868b] transition-transform ${expandedRink === rink.id ? 'rotate-180' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                              </svg>
                            </div>
                          </div>

                          {/* Expanded Rink Content - Locker Rooms */}
                          {expandedRink === rink.id && (
                            <div className="mt-2 ml-2 bg-[#f5f5f7] border border-[#e8e8ed] rounded-lg p-3 space-y-2">
                              {/* Locker Rooms List */}
                              {rink.locker_rooms && rink.locker_rooms.length > 0 && (
                                <div className="space-y-1.5 mb-3">
                                  <p className="text-xs font-semibold text-[#6e6e73] uppercase tracking-wide">Locker Rooms</p>
                                  {rink.locker_rooms.map(room => (
                                    <div key={room.id} className="flex items-center justify-between bg-white rounded-lg p-2.5 text-sm">
                                      <span className="text-[#3d3d3d] font-medium">{room.name}</span>
                                      <button
                                        onClick={() => handleDeleteLockerRoom(room.id, rink.id)}
                                        disabled={deletingLockerRoom === room.id}
                                        className="p-1 hover:bg-red-50 rounded transition text-red-500 hover:text-red-600 disabled:opacity-50"
                                        title="Delete locker room"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Add Locker Room Form */}
                              {addingLockerRoom === rink.id ? (
                                <div className="bg-white rounded-lg p-2.5 space-y-2 border border-[#e8e8ed]">
                                  <input
                                    type="text"
                                    value={newLockerRoomName}
                                    onChange={e => setNewLockerRoomName(e.target.value)}
                                    placeholder="Locker room name..."
                                    className={inputCls + ' text-xs'}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleAddLockerRoom(rink.id);
                                    }}
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleAddLockerRoom(rink.id)}
                                      disabled={!newLockerRoomName.trim() || saving}
                                      className="flex-1 px-2 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg text-xs transition disabled:opacity-50"
                                    >
                                      {saving ? 'Adding...' : 'Add'}
                                    </button>
                                    <button
                                      onClick={() => {
                                        setAddingLockerRoom(null);
                                        setNewLockerRoomName('');
                                      }}
                                      className="flex-1 px-2 py-1.5 bg-[#e8e8ed] text-[#3d3d3d] font-semibold rounded-lg text-xs transition hover:bg-[#d8d8dd]"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setAddingLockerRoom(rink.id)}
                                  className="text-xs text-cyan-600 hover:text-cyan-700 font-semibold transition"
                                >
                                  + Add locker room
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="bg-[#f5f5f7] border border-dashed border-[#e8e8ed] rounded-lg p-4 text-center text-sm text-[#86868b]">
                        No rinks found for this venue
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="bg-white border border-[#e8e8ed] rounded-xl p-8 text-center">
              <p className="text-[#86868b]">No venues found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default VenuesPage;
