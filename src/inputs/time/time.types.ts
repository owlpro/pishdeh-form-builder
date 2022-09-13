import { TimePickerProps } from '@mui/x-date-pickers'
import { MuiPickersAdapter } from '@mui/x-date-pickers/internals'
import { Dayjs } from 'dayjs'
import { Variant } from '../../types/helper.types'
import { BaseInput } from '../../types/input.base'

export type TimeInputValueType = Dayjs | any
export interface TimeInputProps
    extends BaseInput<TimeInputValueType>,
        Omit<TimePickerProps<TimeInputValueType, TimeInputValueType>, 'onChange' | 'value' | 'renderInput'> {
    type: 'time'
    dateAdapter?: new (...args: any) => MuiPickersAdapter<unknown>
    variant?: Variant
    defaultValue?: TimeInputValueType
}
