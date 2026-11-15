# BIOPILOT: M2 the session's token, kept in a variable no program sees (not exported, removed first).
set -g __is_session_token "$BIOPILOT_SESSION_TOKEN"
set -e BIOPILOT_SESSION_TOKEN
function __is_copy_function; functions $argv[1] | sed "s/^function $argv[1]/function $argv[2]/" | source; end
function __is_prompt_start; printf '\e]6973;PS\a'; end
function __is_prompt_end; printf '\e]6973;PE\a'; end

__is_copy_function fish_prompt is_user_prompt

function __is_escape_value
	echo $argv \
	| string replace -a '\\' '\\\\' \
	| string replace -a ';' '\\x3b' \
	| string replace -a \e '\\x1b' \
	| string replace -a \a '\\x07' \
	| string split \n | string join '\x0a' \
	;
end
function __is_update_cwd --on-event fish_prompt; set __is_cwd (__is_escape_value "$PWD"); printf "\e]6973;CWD;%s\a" $__is_cwd; end
# BIOPILOT: M2 report the environment BioPilot needs to find the binaries the shell would run.
function __is_update_env --on-event fish_prompt; printf "\e]6973;ENV;%s;%s;%s\a" "$__is_session_token" (__is_escape_value (string join : $PATH)) (__is_escape_value "$CONDA_PREFIX"); end

if [ "$BIOPILOT_TESTING" = "1" ]
	function is_user_prompt; printf '> '; end
	set -Ua fish_features no-query-term
end

function fish_prompt;
    set --local __user_prompt_lines (is_user_prompt)
    set --local __user_prompt (string join '\n' $__user_prompt_lines)
	set --local __prompt (string join '' (__is_prompt_start) $__user_prompt (__is_prompt_end))
    # Pass the prompt as data so a literal % is not a printf conversion.
    printf '%s' $__prompt
end

# BIOPILOT: create-cd begin. `biopilot create --print <project>` creates the project and enters it: a program
# cannot change its shell's folder, so the shell runs the printed line itself, once checked to be the
# `mkdir -p … && cd …` line. Every other biopilot command runs as is.
function biopilot
	set --local __is_name
	if test (count $argv) -eq 3; and test "$argv[1]" = create
		if test "$argv[2]" = --print
			set __is_name $argv[3]
		else if test "$argv[3]" = --print
			set __is_name $argv[2]
		end
	end
	if test -z "$__is_name"; or string match -q -- '-*' "$__is_name"
		command biopilot $argv
		return
	end
	set --local __is_create_line (command biopilot create --print $__is_name); or return
	printf '%s\n' $__is_create_line
	if not string match -q -- 'mkdir -p *' "$__is_create_line"; or test (count $__is_create_line) -ne 1
		return 1
	end
	eval $__is_create_line
end
# BIOPILOT: create-cd end
