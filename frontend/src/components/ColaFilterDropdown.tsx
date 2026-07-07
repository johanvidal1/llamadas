import { FilterDropdown } from './FilterDropdown'

export type ListCola =
  | 'ALL'
  | 'FUNNEL'
  | 'PENDING'
  | 'VOLVER_A_LLAMAR'
  | 'NO_CONTESTA'
  | 'NO_CONTESTA_DEPURADO'
  | 'OTROS'

export type ColaFilterDropdownProps = {
  value: ListCola
  onChange: (v: ListCola) => void
  isAdmin: boolean
  id?: string
  options: readonly { value: ListCola; label: string }[]
  getDescription: (value: ListCola, isAdmin: boolean) => string
}

export function ColaFilterDropdown({
  value,
  onChange,
  isAdmin,
  id,
  options,
  getDescription,
}: ColaFilterDropdownProps) {
  return (
    <FilterDropdown
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      getDescription={(v) => getDescription(v, isAdmin)}
    />
  )
}
