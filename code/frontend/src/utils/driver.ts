export interface DriverAvailability {
  driverId: string;
  userId: string;
  isAvailable: boolean;
  currentLat: number | null;
  currentLng: number | null;
  updatedAt: string;
}

export interface DriverLocation {
  driverId: string;
  currentLat: number | null;
  currentLng: number | null;
  isAvailable: boolean;
  updatedAt: string;
}

export async function fetchDriverAvailability(
  token: string,
  apiBaseUrl: string = ''
): Promise<DriverAvailability> {
  const response = await fetch(`${apiBaseUrl}/api/driver/availability`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch availability: ${response.statusText}`);
  }

  const json = await response.json();
  return json.data;
}

export async function updateDriverAvailability(
  token: string,
  isAvailable: boolean,
  apiBaseUrl: string = ''
): Promise<{ success: boolean; message: string; data: { driver: any } }> {
  const response = await fetch(`${apiBaseUrl}/api/driver/availability`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ isAvailable }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update availability: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchDriverLocation(
  token: string,
  apiBaseUrl: string = ''
): Promise<DriverLocation> {
  const response = await fetch(`${apiBaseUrl}/api/driver/location`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch location: ${response.statusText}`);
  }

  const json = await response.json();
  return json.data;
}

export async function updateDriverLocation(
  token: string,
  lat: number,
  lng: number,
  apiBaseUrl: string = ''
): Promise<{ success: boolean; message: string; data: { driver: any } }> {
  const response = await fetch(`${apiBaseUrl}/api/driver/location`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ lat, lng }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update location: ${response.statusText}`);
  }

  return response.json();
}
