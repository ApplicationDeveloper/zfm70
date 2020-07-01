const SerialPort = require('serialport');

/*
 * TODO: 
 * Buffer arguments.
 * Debug/verbose level? -v, -vv, -vvv
 * Append debug message to return data.
 * Test stack overflow.
 * Test memory usage.
 */

const Package = function(identifier, length, instruction, ...payload) {
    const debug = (...args) => {
        if (this.showDebug) {
            logDebug(...args);
        }
    };

    const packet = [];	

    if (Object.values(Identifier).indexOf(identifier) < 0) {
        throw `Package identifier: ${identifier} is invalid`;
    }

    if (Object.values(Instruction).indexOf(instruction) < 0) {
        throw `Instruction code: ${instruction} is invalid`;
    }

    packet.push(Fingerprint.HEADER >> 8);
    packet.push(Fingerprint.HEADER);
    packet.push(Fingerprint.MODULE_ADDRESS >> 24);
    packet.push(Fingerprint.MODULE_ADDRESS >> 16);
    packet.push(Fingerprint.MODULE_ADDRESS >> 8);
    packet.push(Fingerprint.MODULE_ADDRESS);
    packet.push(identifier);
    packet.push(length >> 8);
    packet.push(length);
    packet.push(instruction);

    let checksum = identifier + length + instruction;

    debug('Payload: ', payload);

    for (let i = 0; i < payload.length; ++i) {
        if (Array.isArray(payload[i])) {
            for (let j = 0; j < payload[i].length; ++j) {
                packet.push(payload[i][j]);
                checksum += payload[i][j];
            }
        }
        else {
            packet.push(payload[i]);
            checksum += payload[i];
        }
    }

    packet.push(checksum >> 8);
    packet.push(checksum);

    debug('Checksum: ', checksum);

    const package = Buffer.from(packet);

    debug('Package: ', package);

    return package;
}

Package.prototype.showDebug = false;

const Fingerprint = {
    HEADER: 0xEF01,
    MODULE_ADDRESS: 0xFFFFFFFF,
    DEFAULT_PASSWORD: 0x00000000 // 0xFFFFFFFF
};
const Identifier = {
    COMMAND_PACKET: 0x01,
    DATA_PACKET: 0x02,
    ACKNOWLEDGE_PACKET: 0x07,
    END_PACKET: 0x08
};
const CharacterBuffer = {
    ONE: 0x01,
    TWO: 0x02
};
const Parameter = {
    BAUD_RATE_CONTROL: 4,
    SECURITY_LEVEL: 5,
    DATA_PACKAGE_LENGTH: 6
};
const ControlCode = {
    OFF: 0,
    ON: 1
};
const Instruction = {
    TEMPLATE_INDEX: 0x1F,
    VERIFY_PASSWORD: 0x13,
    SET_PASSWORD: 0x12,
    SET_MODULE_ADDRESS: 0x15,
    SET_SYSTEM_PARAMETER: 0x0E,
    PORT_CONTROL: 0x17,
    READ_SYSTEM_PARAMETERS: 0x0F,
    TEMPLATE_NUM: 0x1D,
    AUTO_SEARCH: 0x32,
    IDENTIFY: 0x34,
    HANDSHAKE: 0x17,
    GENERATE_IMAGE: 0x01,
    SEARCH: 0x04,
    GENERATE_TEMPLATE: 0x05,
    UPLOAD_TEMPLATE: 0x08,
    UPLOAD_IMAGE: 0x0A,
    DOWNLOAD_IMAGE: 0x0B,
    GENERATE_CHARACTER_FILE: 0x02,
    DOWNLOAD_TEMPLATE: 0x09,
    STORE_TEMPLATE: 0x06,
    READ_TEMPLATE: 0x07,
    DELETE_TEMPLATE: 0x0C,
    EMPTY_FINGER_LIBRARY: 0x0D,
    MATCH: 0x03,
    GET_RANDOM_CODE: 0x14,
    WRITE_NOTEPAD: 0x18,
    READ_NOTEPAD: 0x19
};

// TODO: double check confirmation hex code
const Confirmation = {
    FINGER_DETECTED: 0x00,
    ERROR: 0x01,
    FINGER_UNDETECTED: 0x02,
    FINGER_COLLECTION_FAILED: 0x03,
    SUCCESS: 0x00,
    COMMUNICATION_FAIL: 0x1D,
    FAIL: 0x0F,
    SEARCH_FOUND: 0x00,
    SEARCH_NOT_FOUND: 0x09,
    GENERATE_CHAR_FILE_FAILED_DISORDERLY: 0x06,
    GENERATE_CHAR_FILE_FAILED_LACKNESS_POINT: 0x07,
    GENERATE_CHAR_FILE_FAILED_LACKNESS_VALID: 0x15,
    ERROR_UPLOADING_TEMPLATE: 0x0D,
    ADDRESS_BEYOND: 0x0B,
    ERROR_WRITING_FLASH: 0x18,
    WRONG_REGISTER_NUMBER: 0x1A,
    DATA_PACKET_TRANSFER_FAIL: 0x0E,
    ADDRESSING_PAGE_ID_BEYOND_LIBRARY: 0x0B,
    DELETE_TEMPLATE_FAIL: 0x10,
    EMPTY_FAIL: 0x11,
    NOT_MATCH: 0x08
};


function logDebug(...args) {
    console.log('[DEBUG]: ', ...args);
}

function log(...args) {
    console.log('[USER]: ', ...args);
}

function logWarn(...args) {
    console.log('[WARNING]: ', ...args);
}

const Zfm = function(path = '/dev/ttyUSB0', baudRate = 57600, showDebug = false) {
    const port = new SerialPort(path, {
        baudRate
    });

    const debug = (...args) => {
        if (showDebug) {
            logDebug(...args);
        }
    };

    let onDataReceive = () => {};

    // TODO: onOpen, onClose, onError & onData?
    let events = {};

    this.on = (eventName, callback) => {
        events[eventName] = callback;
    };

    const emitEvent = (eventName, args) => {
        events[eventName] && events[eventName](args);
    };

    port.on('open', async (error) => {
        if (error) {
            debug('Error opening port: ', error.message);
        }

        debug('Port opened');
        emitEvent('open', await this.verifyPassword());
    });

    port.on('close', error => {
        if (error) {
            debug('Error closing port: ', error.message);
        }

        debug('Port disconnected');
        emitEvent('close', error);
    });

    port.on('error', error => {
        debug(error.message);
        emitEvent('error', error);
    });

    // port.on('data', data => {
    //     debug('Data: ', data);
    //     onDataReceive(data);
    //     emitEvent('data', data);
    // });

    port.on('readable', () => {
        debug('Data readable');
        onDataReceive();
        emitEvent('readable');
    });

    this.open = (callback) => {
        port.open(callback);
    };
    this.close = (callback) => {
        port.close(callback);
    };

    this.getTemplateIndex = (page) => {
        debug('Template Index');

        if (page < 0 || page > 3) {
            throw 'Page is invalid';
        }

        return this.sendPacket(new Package(
            Identifier.COMMAND_PACKET,
            0x0004,
            Instruction.TEMPLATE_INDEX,
            page
        ), 44).then(data => {
            const confirmationCode = data.confirmationCode;
            const templates = [];

            for (let i = 0; i < data.payload.length; ++i) {
                for (let bit = 0; bit < 8; ++bit) {
                    templates.push((data.payload[i] & 2**bit) !== 0);
                }
            }

            switch (confirmationCode) {
                case Confirmation.SUCCESS:
                    debug('Success');
                    break;
                case Confirmation.ERROR:
                    debug('Communication error');
                    break;
            }

            return {
                confirmationCode,
                templates
            };
        }); 
    }

    this.verifyParameter = (parameter, value) => {
        switch (parameter) {
            case Parameter.BAUD_RATE_CONTROL:
                if (value < 1 || value > 12) {
                    throw 'Baud rate control must be between 1 and 12 inclusive';
                }
                break;
            case Parameter.SECURITY_LEVEL:
                if (value < 1 || value > 5) {
                    throw 'Security level must be between 1 and 5 inclusive';
                }
                break;
            case Parameter.DATA_PACKAGE_LENGTH:
                if (value < 0 || value > 3) {
                    throw 'Data package length must be between 0 and 3 inclusive';
                }
                break;
            default:
                throw 'Invalid parameter';
        }
    }

    this.verifyControlCode = (controlCode) => {
        if (Object.values(controlCode).indexOf(controlCode) === -1) {
            throw 'Invalid control code';
        }
    }

    this.verifyCharacterBuffer = (characterBuffer) => {
        if (Object.values(CharacterBuffer).indexOf(characterBuffer) === -1) {
            throw 'Invalid character buffer';
        }
    };

    this.verifyPassword = (password = Fingerprint.DEFAULT_PASSWORD) => {
        debug('Verify Password');

        return this.sendPacket(new Package(
            Identifier.COMMAND_PACKET,
            0x07,
            Instruction.VERIFY_PASSWORD,
            [ password >> 24, password >> 16, password >> 8, password & 0xFF ]
        ), 12).then(data => {
            switch (data.confirmationCode) {
                case Confirmation.SUCCESS:
                    debug('Correct password');
                    break;
                case Confirmation.ERROR:
                    debug('Error when receiving package');
                    break;
            } 

            return data;
        });
    }

    this.setPassword = (password) => {
        debug('Set Password');

        return this.sendPacket(new Package(
            Identifier.COMMAND_PACKET,
            0x0007,
            Instruction.SET_PASSWORD,
            password
        ), 11).then(data => {
            switch (data.confirmationCode) {
                case Confirmation.SUCCESS:
                    debug('Password setting complete');
                    break;
                case Confirmation.ERROR:
                    debug('Error when receiving package');
                    break;
            }

            return data;
        });
    }

    this.setModuleAddress = (address) => {
        debug ('Set Module Address');

        return this.sendPacket(new Package(
            Identifier.COMMAND_PACKET,
            0x0007,
            Instruction.SET_MODULE_ADDRESS,
            address
        ), 12).then(data => {
            switch (data.confirmationCode) {
                case Confirmation.SUCCESS:
                    debug('Address setting complete');
                    break;
                case Confirmation.ERROR:
                    debug('Error when receiving package');
                    break;
            }

            return data;
        });
    }

    this.setSystemParameter = (parameter, value) => {
        debug('Set System Parameter');
        this.verifyParameter(parameter, value);

        return this.sendPacket(new Package(
            Identifier.COMMAND_PACKET,
            0x0005,
            Instruction.SET_SYSTEM_PARAMETER,
            parameter,
            value
        ), 12).then(data => {
            switch (data.confirmationCode) {
                case Confirmation.SUCCESS:
                    debug('Parameter setting complete');
                    break;
                case Confirmation.ERROR:
                    debug('Error when receiving package');
                    break;
                case Confirmation.WRONG_REGISTER_NUMBER:
                    debug('Wrong register number');
                    break;
            }

            return data;
        });
    }

    this.portControl = (controlCode) => {
        debug('Port Control');
        this.verifyControlCode(controlCode);

        return this.sendPacket(new Package(
            Identifier.COMMAND_PACKET,
            0x0004,
            Instruction.PORT_CONTROL,
            controlCode
        ), 12).then(data => {
            switch (data.confirmationCode) {
                case Confirmation.SUCCESS:
                    debug('Port operation complete');
                    break;
                case Confirmation.ERROR:
                    debug('Error when receiving package');
                    break;
                case Confirmation.COMMUNICATION_FAIL:
                    debug('Fail to operate the communication port');
                    break;
            }

            return data;
        });
    }

    this.readSystemParameters = () => {
        debug('Read System Parameters:');

        return this.sendPacket(new Package(
            Identifier.COMMAND_PACKET,
            0x03,
            Instruction.READ_SYSTEM_PARAMETERS
        ), 28).then(data => {
            switch (data.confirmationCode) {
                case Confirmation.SUCCESS:
                    debug('Read complete');
                    break;
                case Confirmation.ERROR:
                    debug('Error when receiving package');
                    break;
            }

            const payload = data.payload;
            const statusRegister = payload[0] << 8 | payload[1];
            const systemIdentifierCode = payload[2] << 8 | payload[3];
            const fingerLibrarySize = payload[4] << 8 | payload[5];
            const securityLevel = payload[6] << 8 | payload[7];
            const deviceAddress = payload[8] + ' ' + payload[9] + ' ' + payload[10] + ' ' + payload[11];
            const dataPacketSize = payload[12] << 8 | payload[13];
            const baudSettings = payload[14] << 8 | payload[15];

            debug('Status Register: ', statusRegister);
            debug('System Identifier Code: ', systemIdentifierCode);
            debug('Finger Library Size: ', fingerLibrarySize);
            debug('Security Level: ', securityLevel);
            debug('Device Address: ', deviceAddress);
            debug('Data Packet Size: ', dataPacketSize);
            debug('Baud Settings (N * 9600): ', baudSettings);

            return {
                confirmationCode: data.confirmationCode,
                statusRegister,
                systemIdentifierCode,
                fingerLibrarySize,
                securityLevel,
                deviceAddress,
                dataPacketSize,
                baudSettings
            };
        });
    }

    this.getTemplateCount = () => {
        debug('Template Count');

        return this.sendPacket(new Package(
            Identifier.COMMAND_PACKET,
            0x03,
            Instruction.TEMPLATE_NUM 
        ), 14).then(data => {
            switch (data.confirmationCode) {
                case Confirmation.SUCCESS:
                    debug('Read complete');
                    break;
                case Confirmation.ERROR:
                    debug('Error when receiving package');
                    break;
            }

            return {
                confirmationCode: data.confirmationCode,
                value: data.payload[0] << 8 | data.payload[1]
            };
        });
    }

    this.autoSearch = (captureTime, startBitNumber, quantity) => {
        debug('Auto Search');

        return this.sendPacket(new Package(
            Identifier.COMMAND_PACKET,
            0x0008,
            Instruction.AUTO_SEARCH,
            captureTime,
            [ startBitNumber >> 8, startBitNumber & 0xFF ],
            [ quantity >> 8, quantity & 0xFF ]
        ), 16).then(data => {
            const confirmationCode = data.confirmationCode;
            const pageId = data.payload[0] << 8 | data.payload[1];
            const matchScore = data.payload[2] << 8 | data.payload[3];

            switch (data.confirmationCode) {
                case Confirmation.SUCCESS:
                    debug('Read complete');
                    break;
                case Confirmation.ERROR:
                    debug('Error when receiving package');
                    break;
                case Confirmation.GENERATE_CHAR_FILE_FAILED_DISORDERLY:
                    debug('Fail to generate character file due to the over-disorderly fingerprint image');
                    break;
                case Confirmation.GENERATE_CHAR_FILE_FAILED_LACKNESS_POINT:
                    debug('Fail to generate character file due to lackness of character point or over-smallness of fingerprint image');
                    break;
                case Confirmation.SEARCH_NOT_FOUND:
                    debug('No match in the library (both the PageID and matching score are 0)') 
                    break;
            }

            return {
                confirmationCode,
                pageId,
                matchScore
            };
        });
    }

    this.identify = () => {
        debug('Identify');

        return this.sendPacket(new Package(
            Identifier.COMMAND_PACKET,
            0x0003,
            Instruction.IDENTIFY
        ), 16).then(data => {
            const confirmationCode = data.confirmationCode;
            const pageId = data.payload[0] << 8 | data.payload[1];
            const matchScore = data.payload[2] << 8 | data.payload[3];

            switch (data.confirmationCode) {
                case Confirmation.SUCCESS:
                    debug('Read complete');
                    break;
                case Confirmation.ERROR:
                    debug('Error when receiving package');
                    break;
                case Confirmation.GENERATE_CHAR_FILE_FAILED_DISORDERLY:
                    debug('Fail to generate character file due to the over-disorderly fingerprint image');
                    break;
                case Confirmation.GENERATE_CHAR_FILE_FAILED_LACKNESS_POINT:
                    debug('Fail to generate character file due to lackness of character point or over-smallness of fingerprint image');
                    break;
                case Confirmation.SEARCH_NOT_FOUND:
                    debug('No match in the library (both the PageID and matching score are 0)') 
                    break;
            }

            return {
                confirmationCode,
                pageId,
                matchScore
            };
        });
    }

    this.generateImage = () => {
        debug('Generate Image'); 

        return this.sendPacket(new Package(
            Identifier.COMMAND_PACKET,
            0x03,
            Instruction.GENERATE_IMAGE
        ), 12).then(data => {
            switch (data.confirmationCode) {
                case Confirmation.FINGER_DETECTED:
                    debug('Finger collection success');
                    break;
                case Confirmation.ERROR:
                    debug('Error when receiving package');
                    break;
                case Confirmation.FINGER_UNDETECTED:
                    debug('Can\'t detect finger');
                    break;
                case Confirmation.FINGER_COLLECTION_FAILED:
                    debug('Fail to collect finger');
                    break;
            }

            return data;
        });
    }

    this.uploadImage = () => {
        debug('Upload image');

        return this.sendPacket(new Package(
            Identifier.COMMAND_PACKET,
            0x03,
            Instruction.UPLOAD_IMAGE
        ), 12).then(data => {
            switch (data.confirmationCode) {
                case Confirmation.SUCCESS:
                    debug('Ready to transfer data');
                    break;
                case Confirmation.ERROR:
                    debug('Error uploading image');
                    break;
                case Confirmation.FAIL:
                    debug('Failed uploading image');
                    break;
            }

            return data;
        });
    }

    this.downloadImage = () => {
        debug('Download Image');

        return this.sendPacket(new Package(
            Identifier.COMMAND_PACKET,
            0x0003,
            Instruction.DOWNLOAD_IMAGE
        ), 12).then(data => {
            switch (data.confirmationCode) {
                case Confirmation.SUCCESS:
                    debug('Ready to transfer the following data packet');
                    break;
                case Confirmation.ERROR:
                    debug('Error when receiving package');
                    break;
                case Confirmation.DATA_PACKET_TRANSFER_FAIL:
                    debug('Fail to transfer the following data packet');
                    break;
            }

            return data;
        });
    }

    this.generateCharacterFromImage = (characterBuffer) => {
        debug('Generate character from image');
        this.verifyCharacterBuffer(characterBuffer);

        return this.sendPacket(new Package(
            Identifier.COMMAND_PACKET,
            0x0004,
            Instruction.GENERATE_CHARACTER_FILE,
            characterBuffer
        ), 12).then(data => {
            switch (data.confirmationCode) {
                case Confirmation.SUCCESS:
                    log('Generate character file complete');
                    break;
                case Confirmation.ERROR:
                    log('Error when receiving package');
                    break;
                case Confirmation.GENERATE_CHAR_FILE_FAILED_DISORDERLY:
                    log('Fail to generate character file due to the over-disorderly fingerprint image');
                    break;
                case Confirmation.GENERATE_CHAR_FILE_FAILED_LACKNESS_POINT:
                    log('Fail to generate character file due to lackness of character point or over-smallness of fingerprint image');
                    break;
                case Confirmation.GENERATE_CHAR_FILE_FAILED_LACKNESS_VALID:
                    log('Fail to generate the image for the lackness of valid primary image');
                    break;
            }

            return data;
        });
    }

    this.generateTemplate = () => {
        debug('Generate Template');

        return this.sendPacket(new Package(
            Identifier.COMMAND_PACKET,
            0x0003,
            Instruction.GENERATE_TEMPLATE
        ), 12).then(data => {
            switch (data.confirmationCode) {
                case Confirmation.SUCCESS:
                    log('Operation success');
                    break;
                case Confirmation.ERROR:
                    log('Error when receiving package');
                    break;
                case Confirmation.COMBINE_CHARACTER_FILES_FAIL:
                    log('Fail to combine the character files. The character files don\'t belong to one finger');
                    break;
            }

            return data;
        })
    }

    this.uploadTemplate = (characterBuffer) => {
        debug('Upload Template');
        this.verifyCharacterBuffer(characterBuffer);

        return this.sendPacket(new Package(
            Identifier.COMMAND_PACKET,
            0x0004,
            Instruction.UPLOAD_TEMPLATE,
            characterBuffer
        ), 12).then(data => {
            switch (data.confirmationCode) {
                case Confirmation.SUCCESS:
                    debug('Read to transfer the following data packet');
                    break;
                case Confirmation.ERROR:
                    debug('Error when receiving package');
                    break;
                case Confirmation.ERROR_UPLOADING_TEMPLATE:
                    debug('Error when uploading template');
                    break;
            }

            return data;
        });
    }

    this.downloadTemplate = (characterBuffer) => {
        debug('Upload Template');
        this.verifyCharacterBuffer(characterBuffer);

        return this.sendPacket(new Package(
            Identifier.COMMAND_PACKET,
            0x0004,
            Instruction.DOWNLOAD_TEMPLATE,
            characterBuffer
        ), 12).then(data => {
            switch (data.confirmationCode) {
                case Confirmation.SUCCESS:
                    debug('Read to transfer the following data packet');
                    break;
                case Confirmation.ERROR:
                    debug('Error when receiving package');
                    break;
                case Confirmation.DATA_PACKET_TRANSFER_FAI:
                    debug('Fail to receive the following data packages');
                    break;
            }

            return data;
        });
    }

    this.storeTemplate = async (characterBuffer = CharacterBuffer.ONE, position = -1) => {
        debug('Store Template');
        this.verifyCharacterBuffer(characterBuffer);

        if (position === -1) {
            for (let page = 0; page < 4; ++page) {
                if (position >= 0) {
                    break;
                }

                positions = (await this.getTemplateIndex(page)).templates;

                for (let i = 0; i < positions.length; ++i) {
                    if (positions[i] === false) {
                        position = (positions.length * page) + i;
                        break;
                    }
                }
            }
        }

        if (position < 0x0000 || position > (await this.readSystemParameters()).fingerLibrarySize) {
            throw 'Position is invalid';
        }

        return await this.sendPacket(new Package(
            Identifier.COMMAND_PACKET,
            0x0006,
            Instruction.STORE_TEMPLATE,
            characterBuffer,
            [ position >> 8, position & 0xFF ]
        ), 12).then(data => {
            const confirmationCode = data.confirmationCode;
            const pageId = position;

            switch (confirmationCode) {
                case Confirmation.SUCCESS:
                    log('Storage success');
                    break;
                case Confirmation.ERROR:
                    log('Error when receiving package');
                    break;
                case Confirmation.ADDRESS_BEYOND:
                    log('Addressing PageID is beond the finger library');
                    break;
                case Confirmation.ERROR_WRITING_FLASH:
                    log('Error when writing Flash');
                    break;
            }

            return {
                confirmationCode,
                pageId
            };
        });
    }

    this.readTemplate = (characterBuffer, pageId) => {
        debug('Read Template');
        this.verifyCharacterBuffer(characterBuffer);

        return this.sendPacket(new Package( 
            Identifier.COMMAND_PACKET,
            0x0006,
            Instruction.READ_TEMPLATE,
            characterBuffer,
            [ pageId >> 8, pageId & 0xFF ],
        ), 12).then(data => {
            switch (data.confirmationCode) {
                case Confirmation.SUCCESS:
                    debug('Load success');
                    break;
                case Confirmation.ERROR:
                    debug('Error when receiving package');
                    break;
                case Confirmation.ERROR_READING_TEMPLATE:
                    debug('Error when reading template from library or the readout template is invalid');
                    break;
                case Confirmation.ADDRESSING_PAGE_ID_BEYOND_LIBRARY:
                    debug('Addressing PageId is beyond the finger library');
                    break;
            }

            return data;
        });
    }

    this.deleteTemplate = (pageId, quantity = 1) => {
        debug('Delete number of templates');

        return this.sendPacket(new Package(
            Identifier.COMMAND_PACKET,
            0x0007,
            Instruction.DELETE_TEMPLATE,
            [ pageId >> 8, pageId & 0xFF ],
            [ quantity >> 8, quantity & 0xFF ]
        ), 12).then(data => {
            switch (data.confirmationCode) {
                case Confirmation.SUCCESS:
                    debug('Delete success');
                    break;
                case Confirmation.ERROR:
                    debug('Error when receiving package');
                    break;
                case Confirmation.DELETE_TEMPLATE_FAIL:
                    debug('Failed to delete template(s)');
                    break;
            }

            return data;
        });
    }

    this.empty = () => {
        debug('Empty Finger Library');

        return this.sendPacket(new Package(
            Identifier.COMMAND_PACKET,
            0x0003,
            Instruction.EMPTY_FINGER_LIBRARY
        ), 12).then(data => {
            switch (data.confirmationCode) {
                case Confirmation.SUCCESS:
                    debug('Empty success');
                    break;
                case Confirmation.ERROR:
                    debug('Error when receiving package');
                    break;
                case Confirmation.EMPTY_FAIL:
                    debug('Fail to clear finger library');
                    break;
            }

            return data;
        });
    }

    this.checkMatch = () => {
        debug('Matching of Templates');

        return this.sendPacket(new Package(
            Identifier.COMMAND_PACKET,
            0x0003,
            Instruction.MATCH
        ), 14).then(data => {
            const confirmationCode = data.confirmationCode;
            const matchScore = data.payload[0] << 8 | data.payload[1];

            switch (data.confirmationCode) {
                case Confirmation.SUCCESS:
                    debug('Templates of the two buffers are matching');
                    break;
                case Confirmation.ERROR:
                    debug('Error when receiving package');
                    break;
                case Confirmation.NOT_MATCH:
                    debug('Templates of the two buffers aren\'t matching');
                    break;
            }

            return {
                confirmationCode,
                matchScore
            };
        })
    }

    this.searchTemplate = async (characterBuffer, startPageId = 0x0000, count = -1) => {
        debug('Search');
        this.verifyCharacterBuffer(characterBuffer);

        let templateCount = count > 0 ? count : (await this.readSystemParameters()).fingerLibrarySize;

        return await this.sendPacket(new Package(
            Identifier.COMMAND_PACKET,
            0x0008,
            Instruction.SEARCH,
            characterBuffer,
            [ startPageId >> 8, startPageId & 0xFF ],
            [ templateCount >> 8, templateCount & 0xFF ],
        ), 16).then(data => {
            const confirmationCode = data.confirmationCode;
            const pageId = data.payload[0] << 8 | data.payload[1];
            const matchScore = data.payload[2] << 8 | data.payload[3];

            switch (confirmationCode) {
                case Confirmation.SEARCH_FOUND:
                    debug('Found the matching finger');
                    break;
                case Confirmation.ERROR:
                    debug('Error when receiving package');
                    break;
                case Confirmation.SEARCH_NOT_FOUND:
                    debug('No match in the library (both the PageID and match score are 0)');
                    break;
            }
        
            return {
                confirmationCode,
                pageId,
                matchScore
            };
        });
    }

    this.getRandomCode = () => {
        debug('Get Random Code');

        return this.sendPacket(new Package(
            Identifier.COMMAND_PACKET,
            0x0003,
            Instruction.GET_RANDOM_CODE
        ), 16).then(data => {
            const confirmationCode = data.confirmationCode;
            const randomNumber = data.payload[0] << 24 | data.payload[1] << 16 | data.payload[2] << 8 | data.payload[3];

            switch (confirmationCode) {
                case Confirmation.SUCCESS:
                    debug('Generation Success');
                    break;
                case Confirmation.ERROR:
                    debug('Error when receiving package');
                    break;
            }

            return {
                confirmationCode,
                randomNumber
            };
        })
    }

    // TODO: Optional
    // function writeNotepad(pageNumber, value) {
    //     debug('Write Notepad');

    //     return sendPacket(new Package(
    //         Identifier.COMMAND_PACKET,
    //         0x0024,
    //         Instruction.WRITE_NOTEPAD,

    //     ))
    // }
    //
    // function readNotepad(pageNumber) {
    //     debug('Read Notepad');

    //     return sendPacket(new Package(
    //         Identifier.COMMAND_PACKET,
    //         0x0024,
    //         Instruction.READ_NOTEPAD,
    //         pageNumber
    //     ))
    // }

    this.handshake = () => {
        debug('Handshake');

        return this.sendPacket(new Package(
            Identifier.COMMAND_PACKET,
            0x04,
            Instruction.HANDSHAKE,
            0
        ), 12).then(data => {
            switch (data.confirmationCode) {
                case Confirmation.SUCCESS:
                    log('Handshake success');
                    break;
                case Confirmation.ERROR:
                    log('Handshake had an error');
                    break;
                case Confirmation.COMMUNICATION_FAIL:
                    log('Failed to operate the communication port');
                    break;
            }

            return data;
        });
    }

    this.receivePacket = (expectedPacketLength, callbackSuccess, callbackError)  => {
        onDataReceive = data => {
            debug('...');

            // TODO: Check start code.

            const receivedPacket = port.read(expectedPacketLength);

            if (receivedPacket === null) {
                return;
            }

            const packetLength = receivedPacket.length;

            if (packetLength < expectedPacketLength) {
                debug('fragment: ', data);
                return;
            }

            debug('Received packet: ', receivedPacket);

            const packageIdentifier = receivedPacket[6];
            const packageLength = receivedPacket[7] | receivedPacket[8];
            const confirmationCode = receivedPacket[9];

            let payload = [];
            let receivedChecksum = packageIdentifier + packageLength + confirmationCode;

            for (let i = 10; i < packetLength - 2; i++) {
                payload.push(receivedPacket[i]); 
                receivedChecksum += receivedPacket[i];
            }

            const packageChecksum = receivedPacket.slice(-2);

            if (receivedChecksum !== packageChecksum.readUInt16BE()) {
                debug(receivedChecksum, packageChecksum.readUInt16BE());
                callbackError('Checksums does not match');
            }
            else if (packetLength != expectedPacketLength) {
                debug(expectedPacketLength, packetLength);
                callbackError('Incomplete data packet received');
            }
            else {
                debug('Confirmation Code: ', confirmationCode);

                callbackSuccess({
                    packageIdentifier,
                    packageLength,
                    confirmationCode, 
                    payload,
                    packageChecksum
                });
            }
        };
    }

    this.sendPacket = (package, expectedPacketLength) => {
        debug('Send packet: ', package);

        return new Promise((resolve, reject) => {
            port.write(package, error => {
                if (error) {
                    debug('Error on write: ', error.message);
                }

                debug('Message sent');
            });

            port.drain(error => {
                if (error) {
                    debug('Error on drain: ', error);
                    throw error;
                }

                debug('Port drained');

                this.receivePacket(expectedPacketLength, resolve, reject);
            });
        });
    }

    this.wait = (seconds) => {
        return new Promise(resolve => setTimeout(resolve, seconds * 1000));
    };

    this.scanFinger = async () => {
        fingerFound = false;

        log('Waiting for finger...');

        while (!fingerFound) {
            const { confirmationCode } = await this.generateImage();

            fingerFound = confirmationCode === Confirmation.FINGER_DETECTED;
        }

    };

    this.enroll = async () => {
        const searchFound = await this.search(); 

        if (searchFound) {
            log('Finger already enrolled');
            log('Please place new finger...');

            return await this.enroll();
        }

        log('Remove finger');

        await this.wait(2);

        log('Place same finger again...');

        await this.scanFinger();
        await this.generateCharacterFromImage(CharacterBuffer.TWO);

        const matchResult = await this.checkMatch();

        if (matchResult.confirmationCode === Confirmation.SUCCESS) {
            await this.generateTemplate();

            const { pageId } = await this.storeTemplate();

            log('Finger enrolled');
            log('PageId: ', pageId);
            log('Template count: ', (await this.getTemplateCount()).value);

            return true;
        }

        log('Fingers does not match');

        return false;
    };

    this.search = async () => {
        await this.scanFinger();
        await this.generateCharacterFromImage(CharacterBuffer.ONE);

        const result = await this.searchTemplate(CharacterBuffer.ONE);

        log('Position: ', result.pageId);
        log('Match score: ', result.matchScore);

        return result.confirmationCode === Confirmation.SEARCH_FOUND;
    };

    this.listPages = async (page) => {
        const templates = (await this.getTemplateIndex(page)).templates;

        for (let i = 0; i < templates.length; ++i) {
            console.log(`Position ${page * templates.length + i}: `, templates[i] ? 'Used' : 'Unused');
        }
    };
}

module.exports = { 
    Zfm,
    Package,
    Fingerprint,
    Identifier,
    CharacterBuffer,
    ControlCode,
    Parameter,
    Instruction,
    Confirmation
};
