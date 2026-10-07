import React, { useState } from 'react';
import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Ride, VehicleType } from '../../types';
import { calculateFareBreakdown } from '../../utils/fare';
import { calculateRideDistance } from '../../utils/location';

interface RideBookingCardProps {
  onRideCreated: (ride: Ride) => void;
  onOpenAuth: () => void;
}

const PRESET_ROUTES = [
  {
    name: 'Connaught Place ➔ Cyber City Gurugram',
    pickupAddress: 'Connaught Place, New Delhi',
    pickupLat: 28.6315,
    pickupLng: 77.2167,
    dropoffAddress: 'DLF Cyber City, Gurugram',
    dropoffLat: 28.4952,
    dropoffLng: 77.0895,
  },
  {
    name: 'IGI Airport T3 ➔ Noida Sector 18',
    pickupAddress: 'Indira Gandhi International Airport, Terminal 3',
    pickupLat: 28.5562,
    pickupLng: 77.1000,
    dropoffAddress: 'Sector 18 Market, Noida',
    dropoffLat: 28.5708,
    dropoffLng: 77.3260,
  },
  {
    name: 'Saket Select Citywalk ➔ India Gate',
    pickupAddress: 'Select Citywalk Mall, Saket',
    pickupLat: 28.5284,
    pickupLng: 77.2185,
    dropoffAddress: 'India Gate, Rajpath, New Delhi',
    dropoffLat: 28.6129,
    dropoffLng: 77.2295,
  },
];

export const RideBookingCard: React.FC<RideBookingCardProps> = ({ onRideCreated, onOpenAuth }) => {
  const { isAuthenticated } = useAuth();
  const [pickupAddress, setPickupAddress] = useState(PRESET_ROUTES[0].pickupAddress);
  const [pickupLat, setPickupLat] = useState<number>(PRESET_ROUTES[0].pickupLat);
  const [pickupLng, setPickupLng] = useState<number>(PRESET_ROUTES[0].pickupLng);

  const [dropoffAddress, setDropoffAddress] = useState(PRESET_ROUTES[0].dropoffAddress);
  const [dropoffLat, setDropoffLat] = useState<number>(PRESET_ROUTES[0].dropoffLat);
  const [dropoffLng, setDropoffLng] = useState<number>(PRESET_ROUTES[0].dropoffLng);

  const [vehicleType, setVehicleType] = useState<VehicleType>('STANDARD');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Compute live distance and duration
  const distanceKm = calculateRideDistance(
    { lat: pickupLat, lng: pickupLng },
    { lat: dropoffLat, lng: dropoffLng }
  );
  const durationMin = Math.round(distanceKm * 2);
  const fareBreakdown = calculateFareBreakdown(distanceKm, vehicleType);

  const handleApplyPreset = (preset: typeof PRESET_ROUTES[0]) => {
    setPickupAddress(preset.pickupAddress);
    setPickupLat(preset.pickupLat);
    setPickupLng(preset.pickupLng);
    setDropoffAddress(preset.dropoffAddress);
    setDropoffLat(preset.dropoffLat);
    setDropoffLng(preset.dropoffLng);
  };

  const handleBookRide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      onOpenAuth();
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await apiClient.requestRide({
        pickupAddress,
        pickupLat,
        pickupLng,
        dropoffAddress,
        dropoffLat,
        dropoffLng,
        distanceKm,
        durationMin,
        vehicleType,
      });

      // Backend returns: { data: { ride, matched, matchedDriver? } }
      // Extract the ride object from the nested data structure.
      const rideData = (res.data as any)?.ride ?? res.data;
      if (rideData) {
        onRideCreated(rideData);
      }
    } catch (err: any) {
      if (err.statusCode === 401) {
        onOpenAuth();
      }
      setErrorMessage(err.message || 'Failed to request ride');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="card booking-card">
      <div className="card-header">
        <div className="card-title-group">
          <h2>Request a Ride</h2>
          <p className="text-muted">Enter locations or select a preset corridor</p>
        </div>
        <div className="preset-selector">
          <label className="text-xs text-muted">Quick Corridor:</label>
          <select
            className="form-select-sm"
            onChange={(e) => {
              const selected = PRESET_ROUTES[Number(e.target.value)];
              if (selected) handleApplyPreset(selected);
            }}
          >
            {PRESET_ROUTES.map((p, idx) => (
              <option key={idx} value={idx}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <form onSubmit={handleBookRide} className="booking-form">
        {errorMessage && <div className="alert alert-error">{errorMessage}</div>}

        <div className="location-inputs-group">
          <div className="location-input-field">
            <div className="location-pin pickup-pin">🟢</div>
            <div className="input-with-coords">
              <label>Pickup Location</label>
              <input
                type="text"
                className="form-control"
                value={pickupAddress}
                onChange={(e) => setPickupAddress(e.target.value)}
                placeholder="Enter pickup address"
                required
              />
              <div className="coords-preview text-xs text-muted">
                Lat: {pickupLat.toFixed(4)}, Lng: {pickupLng.toFixed(4)}
              </div>
            </div>
          </div>

          <div className="location-connector">
            <span className="dot-line"></span>
          </div>

          <div className="location-input-field">
            <div className="location-pin dropoff-pin">🔴</div>
            <div className="input-with-coords">
              <label>Dropoff Destination</label>
              <input
                type="text"
                className="form-control"
                value={dropoffAddress}
                onChange={(e) => setDropoffAddress(e.target.value)}
                placeholder="Enter destination address"
                required
              />
              <div className="coords-preview text-xs text-muted">
                Lat: {dropoffLat.toFixed(4)}, Lng: {dropoffLng.toFixed(4)}
              </div>
            </div>
          </div>
        </div>

        {/* Vehicle Selection Section */}
        <div className="vehicle-selection-section">
          <label className="section-label">Select Vehicle Category</label>
          <div className="vehicle-cards-grid">
            <button
              type="button"
              className={`vehicle-card ${vehicleType === 'STANDARD' ? 'selected' : ''}`}
              onClick={() => setVehicleType('STANDARD')}
            >
              <div className="vehicle-icon">🚗</div>
              <div className="vehicle-name">Standard</div>
              <div className="vehicle-rate text-xs text-muted">₹30 base + ₹12/km</div>
              <div className="vehicle-price">₹{calculateFareBreakdown(distanceKm, 'STANDARD').totalFare}</div>
            </button>

            <button
              type="button"
              className={`vehicle-card ${vehicleType === 'PREMIUM' ? 'selected' : ''}`}
              onClick={() => setVehicleType('PREMIUM')}
            >
              <div className="vehicle-icon">✨</div>
              <div className="vehicle-name">Premium</div>
              <div className="vehicle-rate text-xs text-muted">₹60 base + ₹20/km</div>
              <div className="vehicle-price">₹{calculateFareBreakdown(distanceKm, 'PREMIUM').totalFare}</div>
            </button>

            <button
              type="button"
              className={`vehicle-card ${vehicleType === 'XL' ? 'selected' : ''}`}
              onClick={() => setVehicleType('XL')}
            >
              <div className="vehicle-icon">🚐</div>
              <div className="vehicle-name">Uber XL</div>
              <div className="vehicle-rate text-xs text-muted">₹50 base + ₹16/km</div>
              <div className="vehicle-price">₹{calculateFareBreakdown(distanceKm, 'XL').totalFare}</div>
            </button>
          </div>
        </div>

        {/* Fare Summary Breakdown */}
        <div className="fare-summary-panel">
          <div className="fare-summary-row">
            <span>Trip Distance</span>
            <span className="font-semibold">{distanceKm} km (~{durationMin} mins)</span>
          </div>
          <div className="fare-summary-row">
            <span>Base Fare</span>
            <span>₹{fareBreakdown.baseFare}</span>
          </div>
          <div className="fare-summary-row">
            <span>Distance Rate</span>
            <span>₹{fareBreakdown.distanceFare}</span>
          </div>
          <div className="fare-summary-divider"></div>
          <div className="fare-summary-total">
            <span>Estimated Total</span>
            <span className="total-amount">₹{fareBreakdown.totalFare}</span>
          </div>
        </div>

        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={isLoading}>
          {isLoading ? 'Searching for Nearby Drivers...' : 'Request Ride Now'}
        </button>
      </form>
    </div>
  );
};
