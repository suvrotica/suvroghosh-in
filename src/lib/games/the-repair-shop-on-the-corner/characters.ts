import type { ActiveDialogue, CharacterId, CharacterMemory, RepairShopGameState } from './types';

export const CHARACTER_PROFILES: Record<
	CharacterId,
	{ name: string; role: string; principal: boolean }
> = {
	bapi: {
		name: 'Bapi Mondal',
		role: 'Tea-stall owner',
		principal: true
	},
	mala: {
		name: 'Mala Sen',
		role: 'Sen Brothers Stores',
		principal: true
	},
	ruma: {
		name: 'Ruma Chatterjee',
		role: 'Courtyard film organiser',
		principal: true
	},
	nikhil: {
		name: 'Nikhil-babu',
		role: 'Retired proofreader at No. 14',
		principal: false
	},
	sabita: {
		name: 'Sabita',
		role: 'First-floor resident',
		principal: false
	}
};

export function createInitialCharacterMemories(): Record<CharacterId, CharacterMemory> {
	return {
		bapi: {
			met: false,
			jobAccepted: false,
			symptomClarified: false,
			faultDiscoveredNoted: false,
			objectReturned: false,
			practicalHelpOffered: false
		},
		mala: {
			met: false,
			jobAccepted: false,
			symptomClarified: false,
			faultDiscoveredNoted: false,
			objectReturned: false,
			practicalHelpOffered: false
		},
		ruma: {
			met: false,
			jobAccepted: false,
			symptomClarified: false,
			faultDiscoveredNoted: false,
			objectReturned: false,
			practicalHelpOffered: false
		},
		nikhil: {
			met: false,
			jobAccepted: false,
			symptomClarified: false,
			faultDiscoveredNoted: false,
			objectReturned: false,
			practicalHelpOffered: false
		},
		sabita: {
			met: false,
			jobAccepted: false,
			symptomClarified: false,
			faultDiscoveredNoted: false,
			objectReturned: false,
			practicalHelpOffered: false
		}
	};
}

export function buildCharacterDialogue(
	speakerId: CharacterId,
	state: RepairShopGameState,
	topic = 'root'
): ActiveDialogue {
	const profile = CHARACTER_PROFILES[speakerId];
	const mem = state.characters[speakerId];

	if (speakerId === 'bapi') {
		const radioStatus = state.jobs.radio;
		const beltKnownNeeded =
			state.unlocks.spareBeltDiscovered ||
			(state.jobs.projector !== 'not_started' && state.projector.inspected);

		if (radioStatus === 'not_started') {
			if (topic === 'clarify') {
				return {
					speakerId,
					speakerName: profile.name,
					speakerRole: profile.role,
					lines: [
						'“I put two fresh cells in on Tuesday. The little red lamp comes on straight away, even when I tap the handle.”',
						'“Only the voice disappears. Set it down at one angle, music; nudge it with a saucer, dead silence.”'
					],
					choices: [
						{ id: 'accept-radio', label: 'Take the radio to the workbench' },
						{ id: 'close', label: 'Give me a moment' }
					]
				};
			}
			return {
				speakerId,
				speakerName: profile.name,
				speakerRole: profile.role,
				lines: [
					'“Good, your shutter’s up. My stall’s gone unnaturally quiet — customers are starting to argue about municipal drainage just to fill the air.”',
					'“Could you look at my portable radio? The light comes on fine, but the sound disappears the moment I move it.”'
				],
				choices: [
					{ id: 'accept-radio', label: 'Accept radio and take a look' },
					{ id: 'clarify', label: 'Ask when it started cutting out' },
					{ id: 'close', label: 'Step back' }
				]
			};
		}

		if (radioStatus === 'tested') {
			return {
				speakerId,
				speakerName: profile.name,
				speakerRole: profile.role,
				lines: [
					'“Is that the afternoon broadcast I hear from your bench? Hand it here — let me try shifting it on the counter.”',
					'“Not a crackle! That’ll save six arguments before five o’clock.”'
				],
				choices: [
					{ id: 'return-radio', label: 'Return the repaired radio' },
					{ id: 'close', label: 'Hold on a moment' }
				]
			};
		}

		if (radioStatus !== 'returned') {
			const foundLoose = state.radio.inspectedParts.includes('speaker-connector');
			if (topic === 'report-fault') {
				return {
					speakerId,
					speakerName: profile.name,
					speakerRole: profile.role,
					lines: [
						'“Hah — one loose lug on the speaker? No wonder the batteries didn’t help. Take your time buttoning it up and tuning a station.”'
					],
					choices: [{ id: 'close', label: 'Back to the shop' }]
				};
			}
			return {
				speakerId,
				speakerName: profile.name,
				speakerRole: profile.role,
				lines: [
					foundLoose
						? '“Did you find what was rattling inside? My kettle’s on whenever you’ve tested it with the cover shut.”'
						: '“No rush — just remember the red power lamp never blinked, only the sound vanished when it moved.”'
				],
				choices: [
					...(foundLoose && !mem.faultDiscoveredNoted
						? [{ id: 'report-fault', label: 'Tell Bapi about the loose speaker lug' }]
						: []),
					{ id: 'close', label: 'Return to workbench' }
				]
			};
		}

		// Radio already returned!
		if (!state.unlocks.spareBeltInDrawer) {
			if (topic === 'ask-belt') {
				return {
					speakerId,
					speakerName: profile.name,
					speakerRole: profile.role,
					lines: [
						'“Square rubber drive belts? Wait — old Haripada left a biscuit tin of cassette and 8mm belts under my counter three monsoons ago.”',
						'“Here, take the tin for your shop drawer. Better they turn Ruma’s projector than sit beside my ginger grater.”'
					],
					choices: [{ id: 'take-belt', label: 'Take spare rubber belts to the shop' }]
				};
			}
			return {
				speakerId,
				speakerName: profile.name,
				speakerRole: profile.role,
				lines: [
					'“Listen to that — clear reception right past the kettle steam. Mala next door and Ruma in the courtyard were both asking if your bench was free.”',
					beltKnownNeeded
						? '“You’re looking for a rubber drive belt? Ask me — I still have Haripada’s tin under the counter.”'
						: '“Oh, if you ever run short of small rubber belts today, tell me. An old tape mechanic left a tin here.”'
				],
				choices: [
					{ id: 'ask-belt', label: 'Ask about the spare rubber belts' },
					{ id: 'close', label: 'Leave Bapi to his tea glasses' }
				]
			};
		}

		return {
			speakerId,
			speakerName: profile.name,
			speakerRole: profile.role,
			lines:
				state.afternoonPhase === 'screening' || state.afternoonPhase === 'afterglow'
					? [
							'“Brought a tray of clay cups out for the film. Even the radio got a rest for twenty minutes.”'
						]
					: [
							'“The radio hasn’t missed a beat all afternoon. Hope that rubber belt from the tin fits Ruma’s machine.”'
						],
			choices: [{ id: 'close', label: 'Nod and step back' }]
		};
	}

	if (speakerId === 'mala') {
		const clockStatus = state.jobs.clock;
		if (state.jobs.radio !== 'returned') {
			return {
				speakerId,
				speakerName: profile.name,
				speakerRole: profile.role,
				lines: [
					'“Afternoon! Finish Bapi’s radio first — without his music he comes over here every ten minutes to ask the time, and my shop clock has stopped too.”',
					'“Come by my counter once his radio is singing again.”'
				],
				choices: [{ id: 'close', label: 'Will do' }]
			};
		}

		if (clockStatus === 'not_started') {
			if (topic === 'clarify') {
				return {
					speakerId,
					speakerName: profile.name,
					speakerRole: profile.role,
					lines: [
						'“My nephew opened the back last Sunday because he ‘wanted to see how escapements work’. When he put it back together, the key still wound smoothly, so the spring isn’t broken.”',
						'“Only nothing reaches the hands. Set it near half past four when it’s running, would you?”'
					],
					choices: [
						{ id: 'accept-clock', label: 'Accept wind-up clock for the bench' },
						{ id: 'close', label: 'Come back in a moment' }
					]
				};
			}
			return {
				speakerId,
				speakerName: profile.name,
				speakerRole: profile.role,
				lines: [
					'“Heard Bapi’s radio wake up down the lane — good work. Could you rescue our counter clock next?”',
					'“It winds smoothly and holds tension, yet both hands stand completely still at quarter past three.”'
				],
				choices: [
					{ id: 'accept-clock', label: 'Accept the wind-up clock' },
					{ id: 'clarify', label: 'Ask if anyone opened it recently' },
					{ id: 'close', label: 'Step away for now' }
				]
			};
		}

		if (clockStatus === 'tested') {
			return {
				speakerId,
				speakerName: profile.name,
				speakerRole: profile.role,
				lines: [
					'“Let me hear it — there’s that brisk little tick! And set right to half past four as well.”',
					'“Put it up on the counter bracket. I’ll have four folding chairs carried into the courtyard for Ruma’s screening.”'
				],
				choices: [
					{ id: 'return-clock', label: 'Return the wind-up clock' },
					{ id: 'close', label: 'Wait a moment' }
				]
			};
		}

		if (clockStatus !== 'returned') {
			return {
				speakerId,
				speakerName: profile.name,
				speakerRole: profile.role,
				lines: [
					state.clock.inspected
						? '“Mixed-up brass wheels, was it? I knew my nephew looked far too innocent on Sunday. Set the hands near 4:30 once the case is shut.”'
						: '“Take it to your bench light — the key turns, so the trouble must be in how the wheels meet inside.”'
				],
				choices: [{ id: 'close', label: 'Back to the bench' }]
			};
		}

		return {
			speakerId,
			speakerName: profile.name,
			speakerRole: profile.role,
			lines:
				state.afternoonPhase === 'screening' || state.afternoonPhase === 'afterglow'
					? [
							'“Locked the shop counter right on six by our newly sensible clock. You can see the screen wonderfully from here.”'
						]
					: [
							'“Look at it keeping proper time behind the counter again. I’ve sent the extra folding chairs round to the courtyard.”'
						],
			choices: [{ id: 'close', label: 'Step back' }]
		};
	}

	if (speakerId === 'ruma') {
		const projStatus = state.jobs.projector;
		if (state.jobs.radio !== 'returned') {
			return {
				speakerId,
				speakerName: profile.name,
				speakerRole: profile.role,
				lines: [
					'“Hello there! I’m tying up the cloth screen for dusk. Once you’ve sorted out Bapi’s radio, come back to the courtyard — this little film projector needs a calm pair of hands.”'
				],
				choices: [{ id: 'close', label: 'See you shortly' }]
			};
		}

		if (projStatus === 'not_started') {
			if (topic === 'clarify') {
				return {
					speakerId,
					speakerName: profile.name,
					speakerRole: profile.role,
					lines: [
						'“When I switch it on, the projection bulb shines brightly, so the electrics are fine.”',
						'“Inside the side cover, though, the lower drive belt feels slack, and whoever threaded the leader missed half the guides. We’ll also need the lens focused cleanly.”'
					],
					choices: [
						{ id: 'accept-projector', label: 'Carry the projector to the workbench' },
						{ id: 'close', label: 'Look around first' }
					]
				};
			}
			return {
				speakerId,
				speakerName: profile.name,
				speakerRole: profile.role,
				lines: [
					'“The cloth screen is up, and the short reel of Kusumtala rooftops is ready. Only the projector refuses to pull film properly.”',
					'“The lamp lights up straight away, yet the transport slips and the film jumps its guides. Could you overhaul it on your bench?”'
				],
				choices: [
					{ id: 'accept-projector', label: 'Accept the film projector' },
					{ id: 'clarify', label: 'Ask what happens when it runs' },
					{ id: 'close', label: 'Not just yet' }
				]
			};
		}

		if (projStatus === 'tested') {
			return {
				speakerId,
				speakerName: profile.name,
				speakerRole: profile.role,
				lines: [
					'“Smooth reels and a focused lens? Wonderful — set it right onto the wooden table in the middle of the courtyard.”',
					state.jobs.clock === 'returned'
						? '“Everyone’s finished for the afternoon. Whenever you’re ready at the table, switch on the screening!”'
						: '“Once Mala’s clock is back on her shelf too, everyone will be free to gather for the screening.”'
				],
				choices: [
					{ id: 'return-projector', label: 'Place repaired projector on courtyard table' },
					{ id: 'close', label: 'Hold onto it briefly' }
				]
			};
		}

		if (projStatus !== 'returned') {
			const needsBeltHint =
				state.projector.coverOpen &&
				state.projector.beltState !== 'spare_fitted' &&
				!state.unlocks.spareBeltInDrawer;
			return {
				speakerId,
				speakerName: profile.name,
				speakerRole: profile.role,
				lines: [
					needsBeltHint
						? '“Perished drive belt? Try asking Bapi at the tea stall — he keeps an old tin of rubber belts from a cassette repairman.”'
						: '“Turn the mechanism by hand before running the lamp; old film prefers patience to force.”'
				],
				choices: [{ id: 'close', label: 'Back to the shop' }]
			};
		}

		// Projector returned
		if (state.afternoonPhase === 'evening_ready') {
			return {
				speakerId,
				speakerName: profile.name,
				speakerRole: profile.role,
				lines: [
					'“Mala’s chairs are out, Bapi’s brought tea, and dusk has settled nicely. Step up to the projector table whenever you’d like to start the film.”'
				],
				choices: [
					{ id: 'start-screening', label: 'Start the courtyard film screening' },
					{ id: 'close', label: 'Take one more look around first' }
				]
			};
		}

		if (state.afternoonPhase === 'screening' || state.afternoonPhase === 'afterglow') {
			return {
				speakerId,
				speakerName: profile.name,
				speakerRole: profile.role,
				lines: [
					'“Look at the light steady on the cloth — not a single jumped frame. Half the lane hasn’t sat together this quietly since winter.”'
				],
				choices: [{ id: 'close', label: 'Watch the screen together' }]
			};
		}

		return {
			speakerId,
			speakerName: profile.name,
			speakerRole: profile.role,
			lines: [
				'“The projector looks right at home on the courtyard table. Finish Mala’s clock next door and we can dim the lamps for the screening.”'
			],
			choices: [{ id: 'close', label: 'Head back to the lane' }]
		};
	}

	if (speakerId === 'nikhil') {
		return {
			speakerId,
			speakerName: profile.name,
			speakerRole: profile.role,
			lines:
				state.afternoonPhase === 'screening' || state.afternoonPhase === 'afterglow'
					? [
							'“Those roof water-tanks in the film look remarkably like our lane forty years ago — minus two television aerials.”'
						]
					: state.unlocks.teaStallRadioPlaying
						? [
								'“Bapi’s radio is back, I hear. Good. Now I can read the back page without listening to him whistle off-key.”'
							]
						: [
								'“Quiet afternoon on the corner. Bapi was looking for you by your shop shutter with a parcel in newspaper.”'
							],
			choices: [{ id: 'close', label: 'Wish him a good afternoon' }]
		};
	}

	// Sabita
	return {
		speakerId,
		speakerName: profile.name,
		speakerRole: profile.role,
		lines:
			state.afternoonPhase === 'screening' || state.afternoonPhase === 'afterglow'
				? [
						'“Mala’s extra chairs arrived just in time. Even the breeze waited until the lamps came on.”'
					]
				: [
						'“The hibiscus likes this corner courtyard — afternoon sun for an hour, then shade before evening film time.”'
					],
		choices: [{ id: 'close', label: 'Smile and step back' }]
	};
}
