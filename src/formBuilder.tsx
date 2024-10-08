import React, { Component, createElement, Fragment } from 'react';
import { selectFromObject, setToObject } from './helpers/general';
import { Input, InputProps, OutputValues, InputActions, ObjectLiteral} from "./types";

import { AutocompleteInput } from './inputs/autocomplete';
import { CheckboxInput } from './inputs/checkbox';
import { CustomInput } from './inputs/custom';
import { DateInput } from './inputs/date';
import { DatetimeInput } from './inputs/datetime';
import { FileInput } from './inputs/file';
import { GroupInput } from './inputs/group';
import { ItemsInput } from './inputs/items';
import { MaskInput } from './inputs/mask';
import { MobileInput } from './inputs/mobile';
import { NumberInput } from './inputs/number';
import { OtpInput } from './inputs/otp';
import { PasswordInput } from './inputs/password';
import { SelectInput } from './inputs/select';
import { TextInput } from './inputs/text';
import { TimeInput } from './inputs/time';
import { ToggleInput } from './inputs/toggle';

interface FormBuilderImplements {
    getValues: (validation: boolean) => OutputValues;
    setValues: (values: ObjectLiteral) => Promise<void>;
    clear: () => Promise<void>;
}

interface IState {
    isMounted: boolean,
    time: number | null,
    inInternalSettingProcess: boolean
}

export interface FormBuilderProps {
    inputs: InputProps[],
    onChange?: Function,
    onMount?: Function
}

export class FormBuilder extends Component<FormBuilderProps, IState> implements FormBuilderImplements {
    state: IState = {
        isMounted: false,
        time: null,
        inInternalSettingProcess: false
    }

    private inputRefs: { [key: string]: Input } = {}
    private inputs: { [key in InputProps['type']]: React.ElementType } = {
        text: TextInput,
        number: NumberInput,
        items: ItemsInput,
        custom: CustomInput,
        checkbox: CheckboxInput,
        mobile: MobileInput,
        otp: OtpInput,
        password: PasswordInput,
        select: SelectInput,
        date: DateInput,
        time: TimeInput,
        datetime: DatetimeInput,
        mask: MaskInput,
        file: FileInput,
        autocomplete: AutocompleteInput,
        toggle: ToggleInput,
        group: GroupInput
    }

    private defaultValues: ObjectLiteral | null = null;
    private didMountEvent: Function[] = [];

    componentDidMount() {
        this.setState({ ...this.state, isMounted: true }, async () => {
            await Promise.all(this.didMountEvent.map((func: Function) => func()))
            this.props.onMount?.(this.getValues(false))
        })
    }

    componentWillUnmount(): void {
        this.setState({ ...this.state, isMounted: false })
    }

    componentDidUpdate(): void {
        this.props.inputs.forEach((item) => {
            const prevVisible = this.lastVisibilityOfInputs[item.selector]?.prev
            const nowVisible = this.lastVisibilityOfInputs[item.selector]?.now
            if ((prevVisible !== nowVisible) && this.defaultValues && Object.keys(this.defaultValues).length) {
                this.setValue(item.selector, this.defaultValues[item.selector])
            }
        })
    }

    public getValues = (validation = true): OutputValues => {
        const data: ObjectLiteral = this.defaultValues || {};

        const invalidInputs: InputProps[] = [];

        this.props.inputs.forEach(inputProps => {
            const input = this.inputRefs[inputProps.selector]
            if (input) {
                if (validation) {
                    const isValid = input.validation();
                    if ((inputProps.required || inputProps.type === "items" || inputProps.type === "group" || inputProps.type === "custom") && !isValid) {
                        invalidInputs.push(inputProps)
                    }
                }
                let value = input.getValue(validation);
                if (inputProps.getMutator && typeof inputProps.getMutator === "function") {
                    // @ts-ignore
                    let mutatedValue = inputProps.getMutator(value)
                    value = mutatedValue !== undefined ? mutatedValue : value;
                }

                setToObject(inputProps.selector, value, data)
            }
        })
        return {
            data,
            validation: {
                status: invalidInputs.length < 1,
                inputs: invalidInputs
            },
        }
    }

    private async setObjectValues(object: ObjectLiteral, path: string[] = []): Promise<any> {
        const objectKeys: string[] = Object.keys(object);
        for (let i = 0; i < objectKeys.length; i++) {
            const key = objectKeys[i]
            if(!key) return
            const value = object[key]
            const joinedSelector = [...path, key].join('.');
            const directInput = this.props.inputs.find(i => i.selector === joinedSelector)
            if (directInput && (directInput.type === "group" || (directInput.type === "custom" && directInput.allowObject))) {
                await this.setNormalValue(joinedSelector, value)
            } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
                await this.setObjectValues(value, [...path, key])
            } else {
                const selector = [...path, key].join('.');
                await this.setNormalValue(selector, value)
            }
        }
    }

    private async setNormalValue(selector: string, value: any) {
        const regex = new RegExp('^(' + selector + ')\\[.*\\=.*\\]\\..*')
        const keyValueSelectors = Object.keys(this.inputRefs).filter(i => regex.test(i))
        if (Array.isArray(value) && keyValueSelectors.length) {
            return await Promise.all(keyValueSelectors.map(async keyValueSelector => {
                let valueItem = selectFromObject(keyValueSelector.replace(selector, ''), value)
                const input: any = this.inputRefs[keyValueSelector]
                if (!input || valueItem === undefined) return false;

                const inputProps = this.props.inputs.find(i => i.selector === keyValueSelector)
                if (inputProps?.setMutator && typeof inputProps.setMutator === "function") {
                    const mutatedValue = inputProps.setMutator(valueItem);
                    valueItem = mutatedValue !== undefined ? mutatedValue : valueItem;
                }
                return input.setValue(valueItem)
            }))
        } else {
            const input = this.inputRefs[selector]
            if (!input) return null;
            const inputProps = this.props.inputs.find(i => i.selector === selector)
            if (inputProps?.setMutator && typeof inputProps.setMutator === "function") {
                const mutatedValue = inputProps.setMutator(value);
                value = mutatedValue !== undefined ? mutatedValue : value;
            }

            return await input?.setValue(value)
        }
    }

    private async setValue(selector: string, value: any) {
        const directInput = this.props.inputs.find(i => i.selector === selector)
        if (directInput && (directInput.type === "group" || (directInput.type === "custom" && directInput.allowObject))) {
            return await this.setNormalValue(selector, value)
        }

        if (value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
            return await this.setObjectValues(value, [selector])
        } else {
            return await this.setNormalValue(selector, value)
        }
    }

    public setValues = async (value: ObjectLiteral): Promise<any> => {
        if (!this.state.isMounted) {
            this.didMountEvent.push(() => this.syncSetValues(value))
        } else {
            return this.syncSetValues(value)
        }
    }

    private syncSetValues = async (value: ObjectLiteral): Promise<any> => {
        this.defaultValues = value;

        return new Promise((resolve) => {
            this.setState({ ...this.state, inInternalSettingProcess: true }, async () => {

                for (const selector in value) {
                    const valueItem = value[selector];
                    await this.setValue(selector, valueItem)
                }

                this.setState({ ...this.state, inInternalSettingProcess: false }, () => {
                    this.props.onChange?.(this.getValues(false))
                    resolve(true)
                })
            })
        })
    }

    public clear = async (): Promise<any> => {
        return new Promise(async (resolve) => {
            this.setState({ ...this.state, inInternalSettingProcess: true }, async () => {
                for (const selector in this.inputRefs) {
                    const input = this.inputRefs[selector]
                    if (input) {
                        await input.clear();
                    }
                }

                this.setState({ ...this.state, inInternalSettingProcess: false }, () => {
                    this.props.onChange?.(this.getValues(false))
                    resolve(true)
                })
            })
        })
    }

    private lastVisibilityOfInputs: ObjectLiteral = {}

    private checkVisibility = (input: InputProps): boolean => {
        let visible: boolean | undefined = true;

        if (typeof input.visible === "function") {
            visible = input.visible(this.getValues(false)?.data);
        } else {
            visible = input.visible;
        }

        const output = visible === true || visible === undefined ? true : false;

        const prev = this.lastVisibilityOfInputs[input.selector]?.now;
        if (prev !== undefined) {
            this.lastVisibilityOfInputs = { ...this.lastVisibilityOfInputs, [input.selector]: { prev, now: output } };
        } else {
            this.lastVisibilityOfInputs = { ...this.lastVisibilityOfInputs, [input.selector]: { prev, now: output } };
        }

        return output;
    }

    private onUpdateInputs = (): Promise<boolean> => {
        return new Promise((resolve) => {
            if (!this.state.inInternalSettingProcess) {
                this.setState({ ...this.state, time: new Date().getTime() }, () => {
                    this.props.onChange?.(this.getValues(false))
                    resolve(true)
                })
            } else {
                resolve(true)
            }
        })
    }

    private executeAction = async (selector: string, action: string, value?: any): Promise<any> => {
        return new Promise(async (resolve) => {
            let output;
            if (this.state.isMounted) {
                if (value !== undefined) {
                    // @ts-ignore
                    output = await this.inputRefs[`${selector}`][`${action}`](value)
                } else {
                    // @ts-ignore
                    output = await this.inputRefs[`${selector}`][`${action}`]()
                }
                resolve(output)
            } else {
                if (value !== undefined) {
                    this.didMountEvent.push(async () => {
                        // @ts-ignore
                        let output = await this.inputRefs[`${selector}`][`${action}`](value)
                        resolve(output)
                    })
                } else {
                    this.didMountEvent.push(async () => {
                        // @ts-ignore
                        let output = await this.inputRefs[`${selector}`][`${action}`]()
                        resolve(output)
                    })
                }
            }
        })
    }

    private renderInput = (input: InputProps, index: number): JSX.Element | null => {
        if (!this.checkVisibility(input)) return null;
        const { wrapper, getMutator, setMutator, ref, ...props } = input
        const actions: InputActions<any> = {
            setValue: (value: any): Promise<any> => this.executeAction(input.selector, 'setValue', value),
            getValue: (validation?: boolean): Promise<any> => this.executeAction(input.selector, 'getValue', validation),
            clear: (): Promise<any> => this.executeAction(input.selector, 'clear'),
            click: (): Promise<any> => this.executeAction(input.selector, 'click'),
            focus: (): Promise<any> => this.executeAction(input.selector, 'focus'),
            blur: (): Promise<any> => this.executeAction(input.selector, 'blur')
        };

        const refSetter = (el: Input) => {
            this.inputRefs[input.selector] = el
            if (typeof (ref) === "function") ref(el)
        }

        const element = createElement(this.inputs[input.type]!, { ref: (el: Input) => refSetter(el), ...props, _call_parent_for_update: this.onUpdateInputs });
        const output = (
            <Fragment key={index}>
                {wrapper ? wrapper(element as JSX.Element, actions as InputActions) : element}
            </Fragment>
        )
        return output;
    }

    render(): JSX.Element {
        return (
            <Fragment>
                {this.props.inputs.map(this.renderInput)}
            </Fragment>
        )
    }
}
