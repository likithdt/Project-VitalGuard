import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import EmergencyAlert from './EmergencyAlert';
import CancelEmergencyModal from './CancelEmergencyModal';

describe('EmergencyAlert - Cancel Emergency Button', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const mockEmergency = {
    id: 42,
    patientName: 'Jane Doe',
    severity: 'CRITICAL',
    riskScore: 92,
    status: 'SEARCHING_HOSPITAL',
    detectedVitals: 'HR 145 BPM • SpO2 82%',
    requiresAmbulance: true,
    requiredDepartment: 'Trauma'
  };

  it('renders Cancel Emergency button next to VIEW DETAILS when active and onCancel is provided', () => {
    const handleView = vi.fn();
    const handleCancel = vi.fn();

    render(
      <EmergencyAlert
        emergency={mockEmergency}
        onView={handleView}
        onCancel={handleCancel}
        role="patient"
      />
    );

    // View Details is present
    const viewBtn = screen.getByRole('button', { name: /view details/i });
    expect(viewBtn).toBeTruthy();

    // Cancel Emergency is present
    const cancelBtn = screen.getByRole('button', { name: /cancel emergency/i });
    expect(cancelBtn).toBeTruthy();
    expect(cancelBtn.className).toContain('btn-cancel-emergency');

    // Click triggers onCancel
    fireEvent.click(cancelBtn);
    expect(handleCancel).toHaveBeenCalledWith(mockEmergency);
  });

  it('does NOT render Cancel Emergency button when emergency is already CANCELLED or RESOLVED', () => {
    const handleCancel = vi.fn();

    render(
      <EmergencyAlert
        emergency={{ ...mockEmergency, status: 'CANCELLED' }}
        onCancel={handleCancel}
        role="patient"
      />
    );

    expect(screen.queryByRole('button', { name: /cancel emergency/i })).toBeNull();
  });
});

describe('CancelEmergencyModal - Confirmation & Safety Rules', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const baseEmergency = {
    id: 42,
    patientName: 'Jane Doe',
    severity: 'CRITICAL',
    status: 'SEARCHING_HOSPITAL'
  };

  it('displays the exact required confirmation question and two action buttons', () => {
    const handleClose = vi.fn();
    const handleConfirm = vi.fn();

    render(
      <CancelEmergencyModal
        isOpen={true}
        emergency={baseEmergency}
        onClose={handleClose}
        onConfirm={handleConfirm}
      />
    );

    // Exact question check
    expect(screen.getByText('Are you sure you want to cancel this emergency request?')).toBeTruthy();

    // Two buttons check
    const keepBtn = screen.getByRole('button', { name: 'Keep Emergency Active' });
    const confirmBtn = screen.getByRole('button', { name: /confirm cancellation/i });

    expect(keepBtn).toBeTruthy();
    expect(confirmBtn).toBeTruthy();

    // Clicking "Keep Emergency Active" calls onClose, NOT onConfirm
    fireEvent.click(keepBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(handleConfirm).not.toHaveBeenCalled();
  });

  it('calls onConfirm when Confirm Cancellation is clicked for unaccepted emergency', () => {
    const handleConfirm = vi.fn();

    render(
      <CancelEmergencyModal
        isOpen={true}
        emergency={baseEmergency}
        onClose={vi.fn()}
        onConfirm={handleConfirm}
      />
    );

    const confirmBtn = screen.getByRole('button', { name: /confirm cancellation/i });
    fireEvent.click(confirmBtn);
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it('displays warning and requires explicit confirmation if accepted by hospital or ambulance', () => {
    const handleConfirm = vi.fn();
    const acceptedEmergency = {
      ...baseEmergency,
      hospitalAccepted: true,
      hospitalName: 'Apollo Speciality Hospital',
      ambulanceUnitId: 'AMB-101',
      status: 'HOSPITAL_ACCEPTED'
    };

    render(
      <CancelEmergencyModal
        isOpen={true}
        emergency={acceptedEmergency}
        onClose={vi.fn()}
        onConfirm={handleConfirm}
      />
    );

    // Warning message displayed
    expect(screen.getByText(/Response Teams Already Dispatched/i)).toBeTruthy();
    expect(screen.getByText(/Apollo Speciality Hospital/i)).toBeTruthy();

    // Checkbox is displayed
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(false);

    // Confirm button is disabled before checking
    const confirmBtn = screen.getByRole('button', { name: /confirm cancellation/i });
    expect(confirmBtn.disabled).toBe(true);

    // Trying to click disabled button does not trigger confirm
    fireEvent.click(confirmBtn);
    expect(handleConfirm).not.toHaveBeenCalled();

    // Check the box
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    expect(confirmBtn.disabled).toBe(false);

    // Now clicking triggers confirm
    fireEvent.click(confirmBtn);
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it('displays error message if cancellation failed', () => {
    render(
      <CancelEmergencyModal
        isOpen={true}
        emergency={baseEmergency}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        error="Network error or unauthorized cancellation."
      />
    );

    expect(screen.getByText('Network error or unauthorized cancellation.')).toBeTruthy();
  });
});
