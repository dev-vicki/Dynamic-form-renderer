import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FormRenderer } from './FormRenderer'
import { complaintSchema, householdSchema, vaccinationSchema } from '../test/schemas'
import * as client from '../api/client'

vi.mock('../api/client', () => ({ submitForm: vi.fn() }))
const submitForm = vi.mocked(client.submitForm)

beforeEach(() => {
  submitForm.mockReset()
})

describe('FormRenderer', () => {
  it.each([
    ['household', householdSchema],
    ['vaccination-visit', vaccinationSchema],
    ['complaint', complaintSchema],
  ])('renders the %s schema without accessibility violations', async (_name, schema) => {
    const { container } = render(<FormRenderer schema={schema} />)
    expect(screen.getByRole('heading', { name: schema.title })).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows and hides a conditional field, restoring its value when shown again', async () => {
    const user = userEvent.setup()
    render(<FormRenderer schema={householdSchema} />)
    const dwelling = screen.getByLabelText(/dwelling type/i)
    expect(screen.queryByLabelText(/monthly rent/i)).not.toBeInTheDocument()

    await user.selectOptions(dwelling, 'rented')
    await user.type(screen.getByLabelText(/monthly rent/i), '12000')
    await user.selectOptions(dwelling, 'owned')
    expect(screen.queryByLabelText(/monthly rent/i)).not.toBeInTheDocument()

    await user.selectOptions(dwelling, 'rented')
    expect(screen.getByLabelText(/monthly rent/i)).toHaveValue(12000)
  })

  it('announces inline errors and focuses the summary on failed submit', async () => {
    const user = userEvent.setup()
    render(<FormRenderer schema={householdSchema} />)
    await user.click(screen.getByRole('button', { name: /^submit$/i }))

    const summary = screen.getByRole('group', { name: /problems with your submission/i })
    expect(summary).toHaveFocus()
    const field = screen.getByLabelText(/name of head of household/i)
    expect(field).toHaveAttribute('aria-invalid', 'true')
    const alerts = screen.getAllByRole('alert')
    expect(alerts.length).toBeGreaterThan(0)
    expect(field.getAttribute('aria-describedby')).toBeTruthy()
    expect(submitForm).not.toHaveBeenCalled()
  })

  it('autosaves a draft and restores it after remount', async () => {
    const user = userEvent.setup()
    const first = render(<FormRenderer schema={householdSchema} />)
    await user.type(screen.getByLabelText(/name of head of household/i), 'Asha Rao')
    await waitFor(() => expect(screen.getByTestId('save-indicator')).toHaveTextContent(/draft saved/i), {
      timeout: 3000,
    })
    first.unmount()

    render(<FormRenderer schema={householdSchema} />)
    expect(screen.getByLabelText(/name of head of household/i)).toHaveValue('Asha Rao')
    expect(screen.getByTestId('save-indicator')).toHaveTextContent(/draft restored/i)
  })

  it('maps a 422 field error onto the right field', async () => {
    const user = userEvent.setup()
    submitForm.mockResolvedValue({
      kind: 'invalid',
      message: 'Validation failed',
      errors: [{ field: 'contactEmail', message: 'This email domain is not accepted.' }],
    })
    render(<FormRenderer schema={complaintSchema} />)
    await user.type(screen.getByLabelText(/your name/i), 'Asha Rao')
    await user.type(screen.getByLabelText(/contact email/i), 'a@blocked.test')
    await user.selectOptions(screen.getByLabelText(/^category/i), 'water')
    await user.selectOptions(screen.getByLabelText(/^severity/i), 'low')
    await user.type(screen.getByLabelText(/incident start date/i), '2024-01-10')
    await user.type(screen.getByLabelText(/^description/i), 'Broken street light')
    await user.click(screen.getByRole('button', { name: /^submit$/i }))

    await waitFor(() => expect(submitForm).toHaveBeenCalledTimes(1))
    const email = screen.getByLabelText(/contact email/i)
    await waitFor(() => expect(email).toHaveAccessibleDescription(/not accepted/i))
    expect(email).toHaveAttribute('aria-invalid', 'true')
  })
})
