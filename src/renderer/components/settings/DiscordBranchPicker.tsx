/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Card, HeadingTertiary, Paragraph } from "@vencord/types/components";
import { Select } from "@vencord/types/webpack/common";

import { SimpleErrorBoundary } from "../SimpleErrorBoundary";
import { SettingsComponent } from "./Settings";

export const DiscordBranchPicker: SettingsComponent = ({ settings }) => {
    const isCustom = settings.fluxerInstance === "custom";

    if (isCustom) {
        const domain = settings.fluxerCustomDomain?.trim();

        return (
            <SimpleErrorBoundary>
                <Card variant="danger">
                    <HeadingTertiary>Custom instance</HeadingTertiary>
                    <Paragraph>
                        You're connected to {domain || "a custom Fluxer instance"}. Switching API versions here isn't
                        supported.
                    </Paragraph>
                    <Paragraph>To switch instances, log out and pick a new one on the sign-in screen.</Paragraph>
                </Card>
            </SimpleErrorBoundary>
        );
    }

    return (
        <SimpleErrorBoundary>
            <Select
                placeholder="Canary"
                options={[
                    { label: "Canary", value: "canary", default: true },
                    { label: "Stable", value: "stable" }
                ]}
                closeOnSelect={true}
                select={v => {
                    settings.discordBranch = v;
                    settings.fluxerInstance = v;
                }}
                isSelected={v => v === settings.fluxerInstance}
                serialize={s => s}
            />
        </SimpleErrorBoundary>
    );
};
