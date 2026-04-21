'use client';

import { useState, useEffect } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api';

interface City {
  id: string;
  name: string;
  state: string;
  venue_count?: number;
}

interface Rink {
  id: string;
  venue_id: string;
  name: string;
  address: string | null;
  locker_rooms?: LockerRoom[];
}

interface Venue {
  id: string;
  name: string;
  city_id: string;
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

// Pencil icon
const PencilIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
  </svg>
);

// Trash icon
const TrashIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
);

// Chevron icon
const ChevronIcon = ({ expanded, className = 'w-5 h-5' }: { expanded: boolean; className?: string }) => (
  <svg className={`${className} text-[#86868b] transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

// X icon
const XIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

// Confirm delete modal
function ConfirmModal({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white rounded-xl p-6 max-w-sm mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
        <p className="text-[#1d1d1f] font-medium mb-4">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-sm transition"
          >
            Delete
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-[#e8e8ed] text-[#3d3d3d] font-semibold rounded-lg text-sm transition hover:bg-[#d8d8dd]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function VenuesPage() {
  // Cities sidebar
  const [cities, setCities] = useState<City[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [loadingCities, setLoadingCities] = useState(true);
  const [addingCity, setAddingCity] = useState(false);
  const [newCityName, setNewCityName] = useState('');
  const [newCityState, setNewCityState] = useState('');
  const [savingCity, setSavingCity] = useState(false);

  // State filter
  const [stateFilter, setStateFilter] = useState<string>('all');

  // Edit city
  const [editingCityId, setEditingCityId] = useState<string | null>(null);
  const [editCityName, setEditCityName] = useState('');
  const [editCityState, setEditCityState] = useState('');

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'city' | 'venue'; id: string; name: string } | null>(null);

  // Venues in selected city
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loadingVenues, setLoadingVenues] = useState(false);
  const [expandedVenue, setExpandedVenue] = useState<string | null>(null);
  const [addingVenue, setAddingVenue] = useState(false);
  const [newVenueName, setNewVenueName] = useState('');
  const [newVenueAddress, setNewVenueAddress] = useState('');
  const [newVenueRinkCount, setNewVenueRinkCount] = useState('2');
  const [newVenueRinkNames, setNewVenueRinkNames] = useState<string[]>(['', '']);
  const [savingVenue, setSavingVenue] = useState(false);

  // Edit venue
  const [editingVenueId, setEditingVenueId] = useState<string | null>(null);
  const [editVenueName, setEditVenueName] = useState('');
  const [editVenueAddress, setEditVenueAddress] = useState('');
  const [savingEditVenue, setSavingEditVenue] = useState(false);

  // Rinks expansion
  const [expandedRink, setExpandedRink] = useState<string | null>(null);

  // Locker rooms
  const [addingLockerRoom, setAddingLockerRoom] = useState<string | null>(null);
  const [newLockerRoomName, setNewLockerRoomName] = useState('');
  const [savingLockerRoom, setSavingLockerRoom] = useState(false);
  const [deletingLockerRoom, setDeletingLockerRoom] = useState<string | null>(null);

  // Load cities on mount
  useEffect(() => {
    loadCities();
  }, []);

  // Load venues when city is selected
  useEffect(() => {
    if (selectedCityId) {
      loadVenuesForCity(selectedCityId);
    }
  }, [selectedCityId]);

  const loadCities = async () => {
    setLoadingCities(true);
    try {
      const res = await fetch(`${API_BASE}/cities`, {
        headers: { 'X-Dev-Bypass': 'true' }
      });
      const json = await res.json();
      if (json.success) {
        setCities(json.data);
        if (json.data.length > 0 && !selectedCityId) {
          setSelectedCityId(json.data[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to load cities', e);
    }
    setLoadingCities(false);
  };

  const loadVenuesForCity = async (cityId: string) => {
    setLoadingVenues(true);
    try {
      const res = await fetch(`${API_BASE}/cities/${cityId}/venues`, {
        headers: { 'X-Dev-Bypass': 'true' }
      });
      const json = await res.json();
      if (json.success) {
        setVenues(json.data);
        setExpandedVenue(null);
        setExpandedRink(null);
      }
    } catch (e) {
      console.error('Failed to load venues', e);
    }
    setLoadingVenues(false);
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

  // ── City CRUD ──

  const handleAddCity = async () => {
    if (!newCityName.trim() || !newCityState.trim()) return;
    setSavingCity(true);
    try {
      const res = await fetch(`${API_BASE}/cities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Dev-Bypass': 'true' },
        body: JSON.stringify({ name: newCityName, state: newCityState })
      });
      const json = await res.json();
      if (json.success) {
        setNewCityName('');
        setNewCityState('');
        setAddingCity(false);
        await loadCities();
        if (json.data?.id) setSelectedCityId(json.data.id);
      }
    } catch (e) {
      console.error('Failed to add city', e);
    }
    setSavingCity(false);
  };

  const handleEditCity = async (cityId: string) => {
    if (!editCityName.trim() || !editCityState.trim()) return;
    setSavingCity(true);
    try {
      const res = await fetch(`${API_BASE}/cities/${cityId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Dev-Bypass': 'true' },
        body: JSON.stringify({ name: editCityName, state: editCityState })
      });
      const json = await res.json();
      if (json.success) {
        setEditingCityId(null);
        await loadCities();
      }
    } catch (e) {
      console.error('Failed to update city', e);
    }
    setSavingCity(false);
  };

  const handleDeleteCity = async (cityId: string) => {
    try {
      const res = await fetch(`${API_BASE}/cities/${cityId}`, {
        method: 'DELETE',
        headers: { 'X-Dev-Bypass': 'true' }
      });
      const json = await res.json();
      if (json.success) {
        setConfirmDelete(null);
        if (selectedCityId === cityId) {
          setSelectedCityId(null);
          setVenues([]);
        }
        await loadCities();
      }
    } catch (e) {
      console.error('Failed to delete city', e);
    }
  };

  // ── Venue CRUD ──

  const handleAddVenue = async () => {
    if (!selectedCityId || !newVenueName.trim()) return;
    const rinkNames = newVenueRinkNames.filter(name => name.trim());
    if (rinkNames.length === 0) return;

    setSavingVenue(true);
    try {
      const res = await fetch(`${API_BASE}/venues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Dev-Bypass': 'true' },
        body: JSON.stringify({
          name: newVenueName,
          address: newVenueAddress || null,
          city_id: selectedCityId,
          rink_names: rinkNames
        })
      });
      const json = await res.json();
      if (json.success) {
        setNewVenueName('');
        setNewVenueAddress('');
        setNewVenueRinkCount('2');
        setNewVenueRinkNames(['', '']);
        setAddingVenue(false);
        await loadVenuesForCity(selectedCityId);
        await loadCities();
      }
    } catch (e) {
      console.error('Failed to add venue', e);
    }
    setSavingVenue(false);
  };

  const handleEditVenue = async (venueId: string) => {
    if (!editVenueName.trim()) return;
    setSavingEditVenue(true);
    try {
      const res = await fetch(`${API_BASE}/venues/${venueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Dev-Bypass': 'true' },
        body: JSON.stringify({ name: editVenueName, address: editVenueAddress || null })
      });
      const json = await res.json();
      if (json.success) {
        setEditingVenueId(null);
        if (selectedCityId) await loadVenuesForCity(selectedCityId);
      }
    } catch (e) {
      console.error('Failed to update venue', e);
    }
    setSavingEditVenue(false);
  };

  const handleDeleteVenue = async (venueId: string) => {
    try {
      const res = await fetch(`${API_BASE}/venues/${venueId}`, {
        method: 'DELETE',
        headers: { 'X-Dev-Bypass': 'true' }
      });
      const json = await res.json();
      if (json.success) {
        setConfirmDelete(null);
        if (selectedCityId) {
          await loadVenuesForCity(selectedCityId);
          await loadCities();
        }
      }
    } catch (e) {
      console.error('Failed to delete venue', e);
    }
  };

  // ── Locker Room CRUD ──

  const handleAddLockerRoom = async (rinkId: string) => {
    if (!newLockerRoomName.trim()) return;
    setSavingLockerRoom(true);
    try {
      const rink = venues.flatMap(v => v.rinks || []).find(r => r.id === rinkId);
      const lockerRoomCount = (rink?.locker_rooms?.length || 0);

      const res = await fetch(`${API_BASE}/director/rinks/${rinkId}/locker-rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Dev-Bypass': 'true' },
        body: JSON.stringify({ name: newLockerRoomName, sortOrder: lockerRoomCount })
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
    setSavingLockerRoom(false);
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

  const startEditCity = (city: City) => {
    setEditingCityId(city.id);
    setEditCityName(city.name);
    setEditCityState(city.state);
  };

  const startEditVenue = (venue: Venue) => {
    setEditingVenueId(venue.id);
    setEditVenueName(venue.name);
    setEditVenueAddress(venue.address || '');
  };

  const inputCls = "w-full px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm focus:ring-2 focus:ring-[#003e79]/20 focus:border-cyan-600 outline-none";
  const labelCls = "block text-sm font-medium text-[#3d3d3d] mb-1";

  // Derive unique states and filtered cities
  const uniqueStates = Array.from(new Set(cities.map(c => c.state))).sort();
  const filteredCities = stateFilter === 'all' ? cities : cities.filter(c => c.state === stateFilter);

  const selectedCity = cities.find(c => c.id === selectedCityId);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-[#fafafa]">
      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <ConfirmModal
          message={`Delete "${confirmDelete.name}"? This cannot be undone.`}
          onConfirm={() => {
            if (confirmDelete.type === 'city') handleDeleteCity(confirmDelete.id);
            else handleDeleteVenue(confirmDelete.id);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* LEFT SIDEBAR - Cities */}
      <div className="w-72 border-r border-[#e8e8ed] bg-white flex flex-col overflow-hidden">
        {/* Add City Button */}
        <div className="p-4 border-b border-[#e8e8ed]">
          {!addingCity ? (
            <button
              onClick={() => setAddingCity(true)}
              className="w-full px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg text-sm transition"
            >
              + Add City
            </button>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="City name..."
                value={newCityName}
                onChange={e => setNewCityName(e.target.value)}
                className={inputCls}
                autoFocus
              />
              <input
                type="text"
                placeholder="State (e.g., IL)"
                value={newCityState}
                onChange={e => setNewCityState(e.target.value.toUpperCase())}
                maxLength={2}
                className={inputCls}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddCity}
                  disabled={!newCityName.trim() || !newCityState.trim() || savingCity}
                  className="flex-1 px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg text-sm transition disabled:opacity-50"
                >
                  {savingCity ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => { setAddingCity(false); setNewCityName(''); setNewCityState(''); }}
                  className="flex-1 px-3 py-2 bg-[#e8e8ed] text-[#3d3d3d] font-semibold rounded-lg text-sm transition hover:bg-[#d8d8dd]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* State Filter */}
        {uniqueStates.length > 1 && (
          <div className="px-4 py-2.5 border-b border-[#e8e8ed]">
            <select
              value={stateFilter}
              onChange={e => setStateFilter(e.target.value)}
              className="w-full px-3 py-1.5 border border-[#e8e8ed] rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#003e79]/20 focus:border-cyan-600 outline-none text-[#3d3d3d]"
            >
              <option value="all">All States ({cities.length})</option>
              {uniqueStates.map(st => (
                <option key={st} value={st}>
                  {st} ({cities.filter(c => c.state === st).length})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Cities List */}
        <div className="flex-1 overflow-y-auto">
          {loadingCities ? (
            <div className="p-4 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79] mx-auto" />
            </div>
          ) : filteredCities.length > 0 ? (
            <div className="space-y-1 p-2">
              {filteredCities.map(city => (
                <div key={city.id}>
                  {editingCityId === city.id ? (
                    /* Inline edit form */
                    <div className="bg-[#f5f5f7] rounded-lg p-2.5 space-y-2">
                      <input
                        type="text"
                        value={editCityName}
                        onChange={e => setEditCityName(e.target.value)}
                        className={inputCls + ' text-sm'}
                        autoFocus
                      />
                      <input
                        type="text"
                        value={editCityState}
                        onChange={e => setEditCityState(e.target.value.toUpperCase())}
                        maxLength={2}
                        className={inputCls + ' text-sm'}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditCity(city.id)}
                          disabled={!editCityName.trim() || !editCityState.trim() || savingCity}
                          className="flex-1 px-2 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg text-xs transition disabled:opacity-50"
                        >
                          {savingCity ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingCityId(null)}
                          className="flex-1 px-2 py-1.5 bg-[#e8e8ed] text-[#3d3d3d] font-semibold rounded-lg text-xs transition hover:bg-[#d8d8dd]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* City row */
                    <div
                      className={`group w-full text-left px-3 py-2.5 rounded-lg transition flex items-center justify-between cursor-pointer ${
                        selectedCityId === city.id
                          ? 'bg-[#003e79] text-white'
                          : 'text-[#3d3d3d] hover:bg-[#f5f5f7]'
                      }`}
                      onClick={() => setSelectedCityId(city.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{city.name}</p>
                        <p className={`text-xs ${selectedCityId === city.id ? 'text-[#e0e0e5]' : 'text-[#86868b]'}`}>
                          {city.state}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        {/* Edit/Delete buttons - show on hover or when selected */}
                        <button
                          onClick={e => { e.stopPropagation(); startEditCity(city); }}
                          className={`p-1 rounded transition opacity-0 group-hover:opacity-100 ${
                            selectedCityId === city.id
                              ? 'hover:bg-[#0052a3] text-white/70 hover:text-white opacity-100'
                              : 'hover:bg-[#e8e8ed] text-[#86868b] hover:text-[#3d3d3d]'
                          }`}
                          title="Edit city"
                        >
                          <PencilIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setConfirmDelete({ type: 'city', id: city.id, name: city.name }); }}
                          className={`p-1 rounded transition opacity-0 group-hover:opacity-100 ${
                            selectedCityId === city.id
                              ? 'hover:bg-red-500/20 text-white/70 hover:text-red-300 opacity-100'
                              : 'hover:bg-red-50 text-[#86868b] hover:text-red-500'
                          }`}
                          title="Delete city"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded ml-1 ${
                            selectedCityId === city.id
                              ? 'bg-[#0052a3] text-white'
                              : 'bg-[#e8e8ed] text-[#3d3d3d]'
                          }`}
                        >
                          {city.venue_count || 0}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-sm text-[#86868b]">
              No cities yet
            </div>
          )}
        </div>
      </div>

      {/* RIGHT MAIN AREA - Venues & Rinks */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedCity ? (
          <>
            {/* Header */}
            <div className="border-b border-[#e8e8ed] bg-white p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-[#1d1d1f]">{selectedCity.name}</h1>
                  <p className="text-sm text-[#6e6e73] mt-1">Manage venues and rinks</p>
                </div>
                {!addingVenue && (
                  <button
                    onClick={() => setAddingVenue(true)}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg transition"
                  >
                    + Add Venue
                  </button>
                )}
              </div>
            </div>

            {/* Venues List */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Add Venue Form */}
              {addingVenue && (
                <div className="bg-white border border-[#e8e8ed] rounded-xl p-4 mb-4 shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)]">
                  <h3 className="font-semibold text-[#1d1d1f] mb-4">Add New Venue</h3>
                  <div className="space-y-4">
                    <div>
                      <label className={labelCls}>Venue Name</label>
                      <input
                        type="text"
                        placeholder="e.g., Downtown Ice Arena"
                        value={newVenueName}
                        onChange={e => setNewVenueName(e.target.value)}
                        className={inputCls}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Address</label>
                      <input
                        type="text"
                        placeholder="e.g., 123 Main St, Anytown"
                        value={newVenueAddress}
                        onChange={e => setNewVenueAddress(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Number of Rinks</label>
                      <select
                        value={newVenueRinkCount}
                        onChange={e => {
                          const count = parseInt(e.target.value);
                          setNewVenueRinkCount(e.target.value);
                          setNewVenueRinkNames(Array(count).fill(''));
                        }}
                        className={inputCls}
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Rink Names</label>
                      <div className="space-y-2">
                        {newVenueRinkNames.map((name, idx) => (
                          <input
                            key={idx}
                            type="text"
                            placeholder={`Rink ${idx + 1} name (e.g., Ice Rink A)`}
                            value={name}
                            onChange={e => {
                              const updated = [...newVenueRinkNames];
                              updated[idx] = e.target.value;
                              setNewVenueRinkNames(updated);
                            }}
                            className={inputCls}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={handleAddVenue}
                        disabled={!newVenueName.trim() || newVenueRinkNames.filter(n => n.trim()).length === 0 || savingVenue}
                        className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg transition disabled:opacity-50"
                      >
                        {savingVenue ? 'Creating...' : 'Create Venue'}
                      </button>
                      <button
                        onClick={() => { setAddingVenue(false); setNewVenueName(''); setNewVenueAddress(''); setNewVenueRinkCount('2'); setNewVenueRinkNames(['', '']); }}
                        className="flex-1 px-4 py-2 bg-[#e8e8ed] text-[#3d3d3d] font-semibold rounded-lg transition hover:bg-[#d8d8dd]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {loadingVenues ? (
                <div className="flex justify-center items-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79]" />
                </div>
              ) : venues.length > 0 ? (
                <div className="space-y-3">
                  {venues.map(venue => (
                    <div key={venue.id}>
                      {/* Venue Card - Edit Mode */}
                      {editingVenueId === venue.id ? (
                        <div className="bg-white border border-cyan-300 rounded-xl p-4 shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)]">
                          <h3 className="font-semibold text-[#1d1d1f] mb-3 text-sm">Edit Venue</h3>
                          <div className="space-y-3">
                            <div>
                              <label className={labelCls}>Venue Name</label>
                              <input
                                type="text"
                                value={editVenueName}
                                onChange={e => setEditVenueName(e.target.value)}
                                className={inputCls}
                                autoFocus
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Address</label>
                              <input
                                type="text"
                                value={editVenueAddress}
                                onChange={e => setEditVenueAddress(e.target.value)}
                                className={inputCls}
                              />
                            </div>
                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={() => handleEditVenue(venue.id)}
                                disabled={!editVenueName.trim() || savingEditVenue}
                                className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg text-sm transition disabled:opacity-50"
                              >
                                {savingEditVenue ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                onClick={() => setEditingVenueId(null)}
                                className="flex-1 px-4 py-2 bg-[#e8e8ed] text-[#3d3d3d] font-semibold rounded-lg text-sm transition hover:bg-[#d8d8dd]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Venue Card - View Mode */
                        <div
                          className="bg-white border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] rounded-xl p-4 cursor-pointer hover:shadow-md transition group"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1" onClick={() => handleExpandVenue(venue.id)}>
                              <h2 className="font-semibold text-[#1d1d1f]">{venue.name}</h2>
                              {venue.address && (
                                <p className="text-xs text-[#86868b] mt-0.5">{venue.address}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              <button
                                onClick={e => { e.stopPropagation(); startEditVenue(venue); }}
                                className="p-1.5 rounded-lg transition opacity-0 group-hover:opacity-100 hover:bg-[#f5f5f7] text-[#86868b] hover:text-[#3d3d3d]"
                                title="Edit venue"
                              >
                                <PencilIcon />
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); setConfirmDelete({ type: 'venue', id: venue.id, name: venue.name }); }}
                                className="p-1.5 rounded-lg transition opacity-0 group-hover:opacity-100 hover:bg-red-50 text-[#86868b] hover:text-red-500"
                                title="Delete venue"
                              >
                                <TrashIcon />
                              </button>
                              <span className="text-sm font-semibold text-[#003e79]">
                                {venue.num_rinks} rink{venue.num_rinks !== 1 ? 's' : ''}
                              </span>
                              <div onClick={() => handleExpandVenue(venue.id)}>
                                <ChevronIcon expanded={expandedVenue === venue.id} />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Expanded Venue Content */}
                      {expandedVenue === venue.id && editingVenueId !== venue.id && (
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
                                      {rink.address && (
                                        <p className="text-xs text-[#86868b] mt-1">{rink.address}</p>
                                      )}
                                    </div>
                                    <ChevronIcon expanded={expandedRink === rink.id} className="w-4 h-4" />
                                  </div>
                                </div>

                                {/* Expanded Rink Content - Locker Rooms */}
                                {expandedRink === rink.id && (
                                  <div className="mt-2 ml-2 bg-[#f5f5f7] border border-[#e8e8ed] rounded-lg p-3 space-y-2">
                                    {rink.locker_rooms && rink.locker_rooms.length > 0 && (
                                      <div className="space-y-1.5 mb-3">
                                        <p className="text-xs font-semibold text-[#6e6e73] uppercase tracking-wide">
                                          Locker Rooms
                                        </p>
                                        {rink.locker_rooms.map(room => (
                                          <div
                                            key={room.id}
                                            className="flex items-center justify-between bg-white rounded-lg p-2.5 text-sm"
                                          >
                                            <span className="text-[#3d3d3d] font-medium">{room.name}</span>
                                            <button
                                              onClick={() => handleDeleteLockerRoom(room.id, rink.id)}
                                              disabled={deletingLockerRoom === room.id}
                                              className="p-1 hover:bg-red-50 rounded transition text-red-500 hover:text-red-600 disabled:opacity-50"
                                              title="Delete locker room"
                                            >
                                              <XIcon />
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {addingLockerRoom === rink.id ? (
                                      <div className="bg-white rounded-lg p-2.5 space-y-2 border border-[#e8e8ed]">
                                        <input
                                          type="text"
                                          value={newLockerRoomName}
                                          onChange={e => setNewLockerRoomName(e.target.value)}
                                          placeholder="Locker room name..."
                                          className={inputCls + ' text-xs'}
                                          onKeyDown={e => { if (e.key === 'Enter') handleAddLockerRoom(rink.id); }}
                                          autoFocus
                                        />
                                        <div className="flex gap-2">
                                          <button
                                            onClick={() => handleAddLockerRoom(rink.id)}
                                            disabled={!newLockerRoomName.trim() || savingLockerRoom}
                                            className="flex-1 px-2 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg text-xs transition disabled:opacity-50"
                                          >
                                            {savingLockerRoom ? 'Adding...' : 'Add'}
                                          </button>
                                          <button
                                            onClick={() => { setAddingLockerRoom(null); setNewLockerRoomName(''); }}
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
                  ))}
                </div>
              ) : (
                <div className="bg-white border border-[#e8e8ed] rounded-xl p-8 text-center">
                  <p className="text-[#86868b]">No venues yet. Add one to get started.</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg text-[#86868b]">Select a city to manage its venues and rinks</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default VenuesPage;
