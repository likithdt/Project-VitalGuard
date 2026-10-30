import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import UberJourneyStepper, { UBER_JOURNEY_STEPS, getStepIndex } from './UberJourneyStepper';

describe('UberJourneyStepper - Uber-Style Journey Status Stepper', () => {
  it('correctly maps all 9 emergency transit statuses to sequence indices', () => {
    expect(getStepIndex('DETECTED')).toBe(0);
    expect(getStepIndex('EMERGENCY_REPORTED')).toBe(0);
    expect(getStepIndex('AMBULANCE_REQUESTED')).toBe(1);
    expect(getStepIndex('AMBULANCE_ASSIGNED')).toBe(1);
    expect(getStepIndex('AMBULANCE_DISPATCHED')).toBe(2);
    expect(getStepIndex('AMBULANCE_ACCEPTED')).toBe(2);
    expect(getStepIndex('EN_ROUTE_TO_PATIENT')).toBe(3);
    expect(getStepIndex('ARRIVED_AT_PATIENT')).toBe(4);
    expect(getStepIndex('PATIENT_PICKED_UP')).toBe(5);
    expect(getStepIndex('EN_ROUTE_TO_HOSPITAL')).toBe(6);
    expect(getStepIndex('ARRIVED_AT_HOSPITAL')).toBe(7);
    expect(getStepIndex('JOURNEY_COMPLETED')).toBe(8);
    expect(getStepIndex('RESOLVED')).toBe(8);
    expect(getStepIndex('COMPLETED')).toBe(8);
  });

  it('renders all 9 defined steps and displays current active step details', () => {
    render(
      <UberJourneyStepper
        currentStatus="EN_ROUTE_TO_PATIENT"
        distanceKm={1.3}
        etaMinutes={4}
      />
    );

    // Displays the active step name prominently
    expect(screen.getByText(/En Route to Patient/i)).toBeTruthy();
    expect(screen.getByText(/Step 4 of 9/i)).toBeTruthy();

    // Displays live metrics
    expect(screen.getByText(/1\.3 km away/i)).toBeTruthy();
    expect(screen.getByText(/ETA ~4 min/i)).toBeTruthy();

    // Confirms all 9 short labels are rendered in sequence
    UBER_JOURNEY_STEPS.forEach(step => {
      expect(screen.getByText(step.shortLabel)).toBeTruthy();
    });
  });

  it('marks completed steps with checkmark and displays verified complete badge when resolved', () => {
    render(
      <UberJourneyStepper
        currentStatus="COMPLETED"
      />
    );

    expect(screen.getByText(/Journey Completed/i)).toBeTruthy();
    expect(screen.getByText(/Verified Complete/i)).toBeTruthy();
  });
});
